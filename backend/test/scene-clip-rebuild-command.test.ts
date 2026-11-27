import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  commitSceneVideoResult,
  db,
  getRun,
  getScene,
  getStageAttempts,
  recordStageAttempt,
  resetAll,
  resolveArtefactPath,
  setFinalVideoPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { resetAssemblyTool, resetVideoStageStartDelayMs, setAssemblyTool } from "../src/orchestrator.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { resetDownloadFetch, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry, type StubVideoProviderMode, type VideoProvider } from "../src/videoProvider.ts";
import { buildApp } from "../src/server.ts";
import { imageProviderFromGenerate } from "./imageProviderFixtures.ts";

// rebuild-scene-clip-only, spec scene-rebuild "The User can rebuild only a scene's clip" — `scope: "clip"` on
// `POST /sessions/{id}/scenes/{id}/rebuild` keeps the image and generates only the clip again.

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const STORED_PNG = buildPng(1920, 1088);
const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from("ftypmp42")]);

const IMAGE_PROVIDER = "image-provider-a";
const BOUND_VIDEO_PROVIDER = "video-provider-a";
const OTHER_VIDEO_PROVIDER = "video-provider-b";

let app: FastifyInstance;
let imageCalls: string[];
let videoCalls: Array<{ provider: string; instruction: string; imageBytes: Buffer }>;
let boundVideoMode: StubVideoProviderMode;

/** A stub video provider that records each submit and answers in the current `boundVideoMode`. */
function recordingVideoProvider(name: string): VideoProvider {
  const stubs = new Map<StubVideoProviderMode, VideoProvider>();
  const stubFor = (mode: StubVideoProviderMode) => {
    if (!stubs.has(mode)) stubs.set(mode, createStubVideoProvider(mode, { bytes: MP4_BYTES }));
    return stubs.get(mode)!;
  };
  const owners = new Map<string, VideoProvider>();
  return {
    async submit(params) {
      videoCalls.push({ provider: name, instruction: params.instruction, imageBytes: params.imageBytes });
      const stub = stubFor(boundVideoMode);
      const answer = await stub.submit(params);
      if (answer.kind === "submitted") owners.set(answer.requestId, stub);
      return answer;
    },
    poll(requestId) {
      return owners.get(requestId)!.poll(requestId);
    },
  };
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

beforeEach(async () => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  imageCalls = [];
  videoCalls = [];
  boundVideoMode = "success-bytes";
  resetDownloadFetch();
  setImageProviderRegistry({
    defaultIdentifier: IMAGE_PROVIDER,
    adapters: {
      [IMAGE_PROVIDER]: imageProviderFromGenerate((instruction) => {
        imageCalls.push(instruction);
        return Promise.resolve({ kind: "success", image: { source: "bytes", bytes: STORED_PNG, contentType: "image/png" } });
      }),
    },
  });
  setVideoProviderRegistry({
    defaultIdentifier: OTHER_VIDEO_PROVIDER, // the active provider has changed since the scene was generated
    adapters: { [BOUND_VIDEO_PROVIDER]: recordingVideoProvider(BOUND_VIDEO_PROVIDER), [OTHER_VIDEO_PROVIDER]: recordingVideoProvider(OTHER_VIDEO_PROVIDER) },
  });
  setAssemblyTool(createStubAssemblyTool());
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  resetAssemblyTool();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
});

async function newSession(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Clip rebuild", script: "A harbor at dusk.", language: "en" } });
  const sessionId = res.json().session.sessionId as string;
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` }); // nothing launches until the test continues it
  return sessionId;
}

/** A generated scene inserted directly, with its image file on disk, bound to `BOUND_VIDEO_PROVIDER`. */
function insertScene(sessionId: string, status: string, index = 1): string {
  const sceneId = randomUUID();
  const image = writeArtefactOnce(getRun(sessionId)!.projectFolder, `scene-${index}-attempt-1.png`, STORED_PNG);
  const clip = status === "chunk-complete" ? writeArtefactOnce(getRun(sessionId)!.projectFolder, `scene-${index}.mp4`, MP4_BYTES) : null;
  db.prepare(
    `INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, image_instruction, video_instruction, result, video_result, provider, video_provider,
       requested_duration_seconds, narration_start_seconds, narration_end_seconds, updated_at)
     VALUES (?, ?, ?, ?, 1, 'legacy', 'old image instruction', 'old video instruction', ?, ?, ?, ?, 8, 0, 8, ?)`,
  ).run(sceneId, sessionId, index, status, image, clip, IMAGE_PROVIDER, BOUND_VIDEO_PROVIDER, new Date().toISOString());
  commitSceneResult(sceneId, image);
  if (clip) commitSceneVideoResult(sceneId, clip);
  return sceneId;
}

const rebuild = (sessionId: string, sceneId: string, payload: object) =>
  app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${sceneId}/rebuild`, payload });
const continueSession = (sessionId: string) => app.inject({ method: "POST", url: `/sessions/${sessionId}/continue` });

describe("accepting a clip-only rebuild", () => {
  it("answers 202 and generates only the clip, from the stored image, on the bound video provider", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    await continueSession(sessionId);

    const res = await rebuild(sessionId, sceneId, { scope: "clip", videoInstruction: "slower camera" });

    expect(res.statusCode).toBe(202);
    await waitFor(() => getScene(sceneId)?.status === "chunk-complete" && getScene(sceneId)?.videoResult !== null);
    expect(imageCalls).toEqual([]);
    expect(videoCalls).toEqual([{ provider: BOUND_VIDEO_PROVIDER, instruction: "slower camera", imageBytes: STORED_PNG }]);
    expect(getScene(sceneId)).toMatchObject({
      result: "scene-1-attempt-1.png",
      videoResult: "scene-1-r1.mp4",
      imageInstruction: "old image instruction",
      videoInstruction: "slower camera",
      rebuildCount: 1,
    });
    expect(existsSync(resolveArtefactPath(getRun(sessionId)!.projectFolder, "scene-1.mp4"))).toBe(true);
  });

  it("returns the scene to image-complete, and keeps the stored VIDEO instruction when none is given", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    const res = await rebuild(sessionId, sceneId, { scope: "clip" });

    expect(res.json()).toEqual({ ok: true, held: true });
    expect(getScene(sceneId)).toMatchObject({ status: "image-complete", result: "scene-1-attempt-1.png", videoResult: null, videoInstruction: "old video instruction" });
    expect(videoCalls).toEqual([]);
  });

  it("starts the held clip when the paused session is continued", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    await rebuild(sessionId, sceneId, { scope: "clip" });

    await continueSession(sessionId);

    await waitFor(() => getScene(sceneId)?.status === "chunk-complete");
    expect(videoCalls.map((call) => call.instruction)).toEqual(["old video instruction"]);
    expect(imageCalls).toEqual([]);
  });

  it("does not assemble the final video again by itself", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    setFinalVideoPath(sessionId, "final-video.mp4");
    await continueSession(sessionId);
    const assembliesBefore = getStageAttempts(sessionId, "assembly").length;

    await rebuild(sessionId, sceneId, { scope: "clip" });

    await waitFor(() => getScene(sceneId)?.status === "chunk-complete");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getStageAttempts(sessionId, "assembly")).toHaveLength(assembliesBefore);
    expect(getRun(sessionId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true });
  });

  it("leaves the scene failed at the video stage, with its image, when the clip cannot be generated", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    await continueSession(sessionId);
    boundVideoMode = "not-retryable-failure";

    await rebuild(sessionId, sceneId, { scope: "clip" });

    await waitFor(() => getScene(sceneId)?.status === "failed");
    expect(getScene(sceneId)).toMatchObject({ result: "scene-1-attempt-1.png", videoResult: null });
    expect(imageCalls).toEqual([]);
  });
});

describe("refusing a clip-only rebuild", () => {
  it.each(["submitted", "image-generating", "image-complete", "video-generating", "failed"])("answers 409 scene-not-ready for a scene in %s", async (status) => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, status);
    const before = getScene(sceneId);

    const res = await rebuild(sessionId, sceneId, { scope: "clip" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "scene-not-ready" });
    expect(getScene(sceneId)).toEqual(before);
  });

  it("answers 400 for an image instruction with the clip scope, and for an unknown scope", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    expect((await rebuild(sessionId, sceneId, { scope: "clip", imageInstruction: "A red boat" })).statusCode).toBe(400);
    expect((await rebuild(sessionId, sceneId, { scope: "image" })).statusCode).toBe(400);
    expect(getScene(sceneId)).toMatchObject({ status: "chunk-complete", rebuildCount: 0, imageInstruction: "old image instruction" });
  });

  it("answers 409 assembly-in-progress and 404 unknown-scene as a full rebuild does", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    expect((await rebuild(sessionId, randomUUID(), { scope: "clip" })).json()).toEqual({ ok: false, reason: "unknown-scene" });
    const now = new Date().toISOString();
    recordStageAttempt({ runId: sessionId, stage: "assembly", providerId: null, queuedAt: now, sentAt: now });
    const during = await rebuild(sessionId, sceneId, { scope: "clip" });

    expect(during.statusCode).toBe(409);
    expect(during.json()).toEqual({ ok: false, reason: "assembly-in-progress" });
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });
});

describe("the full rebuild is unchanged", () => {
  it.each([{}, { scope: "image-and-clip" }])("regenerates the image and the clip for %j", async (payload) => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    expect((await rebuild(sessionId, sceneId, { ...payload, imageInstruction: "fixed image" })).statusCode).toBe(202);
    expect(getScene(sceneId)).toMatchObject({ status: "submitted", result: null, videoResult: null, imageInstruction: "fixed image" });
  });
});
