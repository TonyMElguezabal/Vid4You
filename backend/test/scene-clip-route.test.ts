import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  createScene,
  db,
  getRun,
  getScene,
  markImageComplete,
  markSceneFailed,
  PROJECTS_ROOT,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import { events, launchVideoStage, resetVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// watch-scene-clips (JOS-281) — the session read points at a stored clip, and the clip is served inline with byte
// ranges (design Decisions 1-3), so the scene card can play it as soon as it is stored.

const CLIP_BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  concurrency.resetAll();
  resetVideoProviderRegistry();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  resetVideoStageStartDelayMs();
  await app.close();
});

async function pausedSession(): Promise<{ sessionId: string; projectFolder: string }> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Clip route", script: "A harbor at dusk.", language: "en" } });
  const sessionId = res.json().session.sessionId as string;
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
  return { sessionId, projectFolder: getRun(sessionId)!.projectFolder };
}

function storeFile(projectFolder: string, relativePath: string, bytes: Buffer): void {
  const fullPath = join(PROJECTS_ROOT, projectFolder, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, bytes);
}

/** A scene with a stored image and, when given, a stored clip path (the file itself is written separately). */
function sceneWith(sessionId: string, clip: string | null, rebuildCount = 0, index = 1): string {
  const sceneId = randomUUID();
  createScene(sceneId, sessionId, index, "success", 100);
  markImageComplete(sceneId, "scene-1-attempt-1.png");
  db.prepare("UPDATE scenes SET status = ?, video_result = ?, rebuild_count = ? WHERE id = ?").run(
    clip ? "chunk-complete" : "video-generating",
    clip,
    rebuildCount,
    sceneId,
  );
  return sceneId;
}

const clipUrl = (sessionId: string, sceneId: string) => `/sessions/${sessionId}/scenes/${sceneId}/clip`;
const getClip = (url: string, range?: string) => app.inject({ method: "GET", url, headers: range ? { range } : {} });

describe("The session read points at a stored clip (JOS-281)", () => {
  async function readScene(sessionId: string): Promise<Record<string, any>> {
    return (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().scenes[0];
  }

  it("carries result.videoUrl, the clip route's path, for a scene with a stored clip", async () => {
    const { sessionId } = await pausedSession();
    const sceneId = sceneWith(sessionId, "scene-1.mp4");

    const scene = await readScene(sessionId);

    expect(scene.result).toEqual({ imageUrl: `/sessions/${sessionId}/scenes/${sceneId}/image`, videoUrl: clipUrl(sessionId, sceneId) });
  });

  it("carries the rebuild number after a rebuild", async () => {
    const { sessionId } = await pausedSession();
    const sceneId = sceneWith(sessionId, "scene-1-r1.mp4", 1);

    expect((await readScene(sessionId)).result.videoUrl).toBe(`${clipUrl(sessionId, sceneId)}?r=1`);
  });

  it("carries no videoUrl while the clip is not stored, nor for a scene that failed after its image", async () => {
    const { sessionId } = await pausedSession();
    const sceneId = sceneWith(sessionId, null);
    expect((await readScene(sessionId)).result).toEqual({ imageUrl: `/sessions/${sessionId}/scenes/${sceneId}/image` });

    markSceneFailed(sceneId, "clip rejected");
    expect((await readScene(sessionId)).result).toEqual({ imageUrl: `/sessions/${sessionId}/scenes/${sceneId}/image` });
  });

  it("is carried by the live update sent when the clip is stored", async () => {
    const runId = randomUUID();
    const run = createRun(runId, "Live clip", "The lighthouse stands alone.", "en");
    const generator: VisualInstructionGenerator = { async generate(texts) { return { kind: "success", pairs: texts.map(() => ({ image: "image", video: "video" })) }; } };
    const fragments: SegmentedFragment[] = [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
    const registered = await registerDecomposition(runId, fragments, generator, 8);
    if (!registered.ok) throw new Error("fixture registration failed");
    const sceneId = registered.sceneIds[0]!;
    const imagePath = writeArtefactOnce(run.projectFolder, "scene-1-attempt-1.png", Buffer.from("png"));
    commitSceneResult(sceneId, imagePath);
    markImageComplete(sceneId, imagePath);
    setVideoProviderRegistry({ defaultIdentifier: "test-video", adapters: { "test-video": createStubVideoProvider("success-bytes", { bytes: CLIP_BYTES }) } });
    const updates: SessionSnapshot[] = [];
    const listener = (snapshot: SessionSnapshot) => {
      if (snapshot.session.sessionId === runId) updates.push(snapshot);
    };
    events.on("state", listener);
    try {
      launchVideoStage(sceneId);
      const deadline = Date.now() + 5000;
      while (getScene(sceneId)?.status !== "chunk-complete" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
    } finally {
      events.off("state", listener);
    }

    const last = updates.at(-1)!.scenes.find((scene) => scene.sceneId === sceneId)!;
    expect(last.state).toBe("chunk-complete");
    expect(last.result?.videoUrl).toBe(clipUrl(runId, sceneId));
    expect(toSnapshot(runId)!.scenes[0]!.result?.videoUrl).toBe(clipUrl(runId, sceneId));
  });
});

describe("GET /sessions/:sessionId/scenes/:sceneId/clip (JOS-281)", () => {
  async function storedClip(): Promise<string> {
    const { sessionId, projectFolder } = await pausedSession();
    storeFile(projectFolder, "scene-1.mp4", CLIP_BYTES);
    return clipUrl(sessionId, sceneWith(sessionId, "scene-1.mp4"));
  }

  it("answers 200 with the whole clip inline, video/mp4 and Accept-Ranges", async () => {
    const res = await getClip(await storedClip());

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-length"]).toBe("1000");
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(res.rawPayload.equals(CLIP_BYTES)).toBe(true);
  });

  it("answers 206 with exactly the requested bytes", async () => {
    const res = await getClip(await storedClip(), "bytes=100-199");

    expect(res.statusCode).toBe(206);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-range"]).toBe("bytes 100-199/1000");
    expect(res.headers["content-length"]).toBe("100");
    expect(res.rawPayload.equals(CLIP_BYTES.subarray(100, 200))).toBe(true);
  });

  it("answers 206 for an open-ended range and for a suffix range", async () => {
    const url = await storedClip();
    for (const range of ["bytes=900-", "bytes=-100"]) {
      const res = await getClip(url, range);
      expect(res.statusCode).toBe(206);
      expect(res.headers["content-range"]).toBe("bytes 900-999/1000");
      expect(res.rawPayload.equals(CLIP_BYTES.subarray(900))).toBe(true);
    }
  });

  it("clamps a range that ends past the end of the file", async () => {
    const res = await getClip(await storedClip(), "bytes=990-5000");

    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 990-999/1000");
    expect(res.rawPayload.equals(CLIP_BYTES.subarray(990))).toBe(true);
  });

  it("answers 416 for a range starting at or past the end", async () => {
    const res = await getClip(await storedClip(), "bytes=1000-");

    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */1000");
  });

  it("answers the whole file for a header that is not one byte range", async () => {
    const url = await storedClip();
    for (const range of ["bytes=0-9,20-29", "items=0-9", "bytes=abc", "bytes=50-10"]) {
      const res = await getClip(url, range);
      expect(res.statusCode).toBe(200);
      expect(res.rawPayload.equals(CLIP_BYTES)).toBe(true);
    }
  });

  it("answers 404 for a scene whose clip is not stored, and when the stored file is missing", async () => {
    const { sessionId } = await pausedSession();

    expect((await getClip(clipUrl(sessionId, sceneWith(sessionId, null)))).statusCode).toBe(404);
    expect((await getClip(clipUrl(sessionId, sceneWith(sessionId, "scene-2.mp4", 0, 2)))).statusCode).toBe(404);
  });

  it("answers 404 for a scene asked for under another session's identifier", async () => {
    const owner = await pausedSession();
    const other = await pausedSession();
    storeFile(owner.projectFolder, "scene-1.mp4", CLIP_BYTES);
    const sceneId = sceneWith(owner.sessionId, "scene-1.mp4");

    const res = await getClip(clipUrl(other.sessionId, sceneId));

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(CLIP_BYTES)).toBe(false);
  });

  it("refuses a stored path that escapes the project folder and never reads the outside file", async () => {
    const victim = await pausedSession();
    const attacker = await pausedSession();
    storeFile(victim.projectFolder, "scene-1.mp4", CLIP_BYTES);
    const sceneId = sceneWith(attacker.sessionId, `../${victim.projectFolder}/scene-1.mp4`);

    const res = await getClip(clipUrl(attacker.sessionId, sceneId));

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(CLIP_BYTES)).toBe(false);
  });

  it("serves the clip when the URL carries the rebuild number", async () => {
    const { sessionId, projectFolder } = await pausedSession();
    storeFile(projectFolder, "scene-1-r1.mp4", CLIP_BYTES);
    const sceneId = sceneWith(sessionId, "scene-1-r1.mp4", 1);

    const res = await getClip(`${clipUrl(sessionId, sceneId)}?r=1`);

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(CLIP_BYTES)).toBe(true);
  });

  it("changes nothing: other methods are not offered, and it is documented with no request body", async () => {
    const url = await storedClip();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(404);
    }
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json<{ paths: Record<string, { get?: { requestBody?: unknown } }> }>();
    const operation = document.paths["/sessions/{sessionId}/scenes/{sceneId}/clip"]?.get;
    expect(operation).toBeDefined();
    expect(operation?.requestBody).toBeUndefined();
  });
});
