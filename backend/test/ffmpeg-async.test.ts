import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AssemblyInput } from "../src/assemblyTool.ts";
import type { AssemblyProgress } from "../src/assemblyProgress.ts";
import { FFPROBE } from "../src/config/ffmpeg.ts";
import { createFfmpegAssemblyTool, runFfmpeg } from "../src/ffmpegAssemblyTool.ts";

// final-video-build-progress, design Decision 1 — ffmpeg runs as an asynchronous child process, so the event loop keeps
// turning (the backend keeps answering) while a final video is built, and its frame reports drive the progress.

const FIXTURE = join(import.meta.dirname, "fixtures", "media-assembly");
const haveFfmpeg = spawnSync(FFPROBE, ["-version"]).status === 0 && existsSync(join(FIXTURE, "voice-over.m4a"));
const work = mkdtempSync(join(tmpdir(), "vid4you-ffmpeg-async-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const FPS = 30;
const ENDS = [3, 5, 9, 11.5, 14.4];

function input(outputPath: string, onProgress?: (progress: AssemblyProgress) => void): AssemblyInput {
  let start = 0;
  let previousFrame = 0;
  return {
    clips: ENDS.map((end, index) => {
      const cumulative = Math.round(end * FPS);
      const clip = {
        clipPath: join(FIXTURE, `scene-${index + 1}-source.mp4`),
        narrationStartSeconds: start,
        narrationDurationSeconds: end - start,
        cumulativeStartFrame: previousFrame,
        frameCount: cumulative - previousFrame,
      };
      start = end;
      previousFrame = cumulative;
      return clip;
    }),
    voiceOverPath: join(FIXTURE, "voice-over.m4a"),
    outputPath,
    fps: FPS,
    width: 640,
    height: 360,
    ...(onProgress ? { onProgress } : {}),
  };
}

describe.skipIf(!haveFfmpeg)("runFfmpeg", () => {
  it("passes ffmpeg's frame reports to onFrame", async () => {
    const frames: number[] = [];
    await runFfmpeg(["-f", "lavfi", "-i", "color=black:s=320x240:d=2:r=30", "-f", "null", "-"], { onFrame: (frame) => frames.push(frame) });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.at(-1)).toBe(60);
  });

  it("rejects with ffmpeg's error output on a non-zero exit", async () => {
    await expect(runFfmpeg(["-i", join(work, "missing.mp4"), "-f", "null", "-"])).rejects.toThrow(/missing\.mp4/);
  });
});

describe.skipIf(!haveFfmpeg)("the ffmpeg assembly tool", () => {
  it("leaves the event loop free while it assembles, and reports both steps in order", async () => {
    const reports: AssemblyProgress[] = [];
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    let result;
    try {
      result = await createFfmpegAssemblyTool().assemble(input(join(work, "out.mp4"), (progress) => reports.push(progress)));
    } finally {
      clearInterval(timer);
    }

    expect(result).toMatchObject({ kind: "success" });
    expect(ticks).toBeGreaterThan(10);
    expect(reports[0]).toEqual({ step: "preparing-clips", clipsDone: 0, clipsTotal: 5, percent: 0 });
    expect(reports.some((report) => report.step === "encoding")).toBe(true);
    expect(reports.findIndex((report) => report.step === "encoding")).toBeGreaterThan(reports.findLastIndex((report) => report.step === "preparing-clips"));
    const percents = reports.map((report) => report.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(Math.max(...percents)).toBeLessThanOrEqual(99);
  }, 60_000);

  it("turns an ffmpeg failure into a transient failure, as before", async () => {
    const broken = input(join(work, "broken.mp4"));
    broken.clips[0] = { ...broken.clips[0]!, clipPath: join(work, "no-such-clip.mp4") };

    const result = await createFfmpegAssemblyTool().assemble(broken);

    expect(result.kind).toBe("failed_transient");
  }, 60_000);
});
