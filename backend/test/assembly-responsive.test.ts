import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AssemblyTool } from "../src/assemblyTool.ts";
import { FFPROBE } from "../src/config/ffmpeg.ts";
import { getRun } from "../src/db.ts";
import { createFfmpegAssemblyTool } from "../src/ffmpegAssemblyTool.ts";
import { setAssemblyTool } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import { finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";

// final-video-build-progress, spec "The assembly does not block the app" — with the real ffmpeg tool, the backend
// answers a session read and the rebuild request itself while a final video is being encoded.

const FIXTURE = join(import.meta.dirname, "fixtures", "media-assembly");
const haveFfmpeg = spawnSync(FFPROBE, ["-version"]).status === 0 && existsSync(join(FIXTURE, "voice-over.m4a"));

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(resetRebuildEnvironment);

/** The real ffmpeg tool on the committed fixture clips and narration; `running` is true while it assembles. */
function realToolOnFixtures(state: { running: boolean; ended: boolean }): AssemblyTool {
  const real = createFfmpegAssemblyTool({ ffmpegHasSubtitleFilter: () => false });
  return {
    async assemble(input) {
      state.running = true;
      try {
        return await real.assemble({
          clips: input.clips.map((clip, index) => ({ ...clip, clipPath: join(FIXTURE, `scene-${index + 1}-source.mp4`) })),
          voiceOverPath: join(FIXTURE, "voice-over.m4a"),
          outputPath: input.outputPath,
          fps: input.fps,
          width: input.width,
          height: input.height,
          ...(input.onProgress ? { onProgress: input.onProgress } : {}),
        });
      } finally {
        state.running = false;
        state.ended = true;
      }
    },
  };
}

describe.skipIf(!haveFfmpeg)("while a final video is rebuilt with ffmpeg", () => {
  it("answers the rebuild request and a session read before the assembly ends", async () => {
    const { runId, sceneIds } = await finishedSession();
    await app.inject({ method: "POST", url: `/sessions/${runId}/scenes/${sceneIds[0]!}/pause`, payload: { seconds: 3.3 } });
    const state = { running: false, ended: false };
    setAssemblyTool(realToolOnFixtures(state));

    const rebuild = await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });
    expect(rebuild.statusCode).toBe(202);
    expect(state.ended).toBe(false);

    await waitFor(() => state.running, 10_000);
    const startedAt = Date.now();
    const read = await app.inject({ method: "GET", url: `/sessions/${runId}` });
    expect(read.statusCode).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(state.ended).toBe(false);

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4", 60_000);
  }, 90_000);
});
