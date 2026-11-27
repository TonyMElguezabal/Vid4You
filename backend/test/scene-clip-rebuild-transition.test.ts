import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  commitSceneResult,
  commitSceneVideoResult,
  countSceneResults,
  createRun,
  db,
  getRun,
  getScene,
  markSceneForClipRebuild,
  resetAll,
  resolveArtefactPath,
  setFinalVideoPath,
} from "../src/db.ts";

// rebuild-scene-clip-only, design Decision 2 — the one conditional write that returns a complete scene to
// `image-complete` with only its clip withdrawn. The image, its guard row and its instruction are kept.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Clip rebuild transition", "A short script.", "en");
  return runId;
}

function insertScene(runId: string, overrides: Record<string, string | number | null> = {}): string {
  const sceneId = randomUUID();
  const columns = {
    id: sceneId,
    run_id: runId,
    idx: 1,
    status: "chunk-complete",
    attempts: 2,
    last_error: "an old error",
    instruction: "legacy instruction",
    image_instruction: "old image instruction",
    video_instruction: "old video instruction",
    result: "scene-1-attempt-2.png",
    video_result: "scene-1.mp4",
    provider: "image-provider-a",
    video_provider: "video-provider-a",
    requested_duration_seconds: 8,
    narration_start_seconds: 1.5,
    narration_end_seconds: 9.5,
    current_request_id: "request-1",
    video_request_sent_at: "2026-10-28T10:00:00.000Z",
    video_request: "{}",
    updated_at: "2026-10-28T10:00:00.000Z",
    ...overrides,
  };
  const names = Object.keys(columns);
  db.prepare(`INSERT INTO scenes (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...Object.values(columns));
  commitSceneResult(sceneId, "scene-1-attempt-2.png");
  commitSceneVideoResult(sceneId, "scene-1.mp4");
  return sceneId;
}

const rebuildCount = (sceneId: string) => (db.prepare("SELECT rebuild_count c FROM scenes WHERE id = ?").get(sceneId) as { c: number }).c;
const clipGuardRows = (sceneId: string) =>
  (db.prepare("SELECT COUNT(*) c FROM scene_video_results WHERE scene_id = ?").get(sceneId) as { c: number }).c;
const corrections = (runId: string) => resolveArtefactPath(getRun(runId)!.projectFolder, "corrected-instructions.json");

describe("which scenes can have only their clip rebuilt", () => {
  it("accepts a complete scene with its image and clip", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    expect(markSceneForClipRebuild(runId, sceneId)).toBe(true);
    expect(getScene(sceneId)!.status).toBe("image-complete");
  });

  it.each(["submitted", "image-generating", "image-complete", "video-generating", "failed"])("refuses a scene in %s and changes nothing", (status) => {
    const runId = newRunId();
    const sceneId = insertScene(runId, { status });
    const before = getScene(sceneId);

    expect(markSceneForClipRebuild(runId, sceneId, "new")).toBe(false);

    expect(getScene(sceneId)).toEqual(before);
    expect(rebuildCount(sceneId)).toBe(0);
  });

  it.each([
    ["no image", { result: null }],
    ["no clip", { video_result: null }],
  ])("refuses a complete scene with %s", (_label, overrides) => {
    const runId = newRunId();
    const sceneId = insertScene(runId, overrides);

    expect(markSceneForClipRebuild(runId, sceneId)).toBe(false);
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });

  it("refuses a scene of another session", () => {
    const sceneId = insertScene(newRunId());

    expect(markSceneForClipRebuild(newRunId(), sceneId)).toBe(false);
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });

  it("accepts only the first of two back-to-back calls", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    expect(markSceneForClipRebuild(runId, sceneId)).toBe(true);
    expect(markSceneForClipRebuild(runId, sceneId)).toBe(false);
    expect(rebuildCount(sceneId)).toBe(1);
  });
});

describe("what an accepted clip-only rebuild changes", () => {
  it("withdraws the clip, attempts and request, and keeps the image", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForClipRebuild(runId, sceneId);

    expect(getScene(sceneId)).toMatchObject({
      status: "image-complete",
      result: "scene-1-attempt-2.png",
      videoResult: null,
      attempts: 0,
      lastError: null,
      videoRequestSentAt: null,
      videoRequestBody: null,
      imageInstruction: "old image instruction",
      instruction: "legacy instruction",
    });
    expect(db.prepare("SELECT current_request_id r FROM scenes WHERE id = ?").get(sceneId)).toEqual({ r: null });
    expect(rebuildCount(sceneId)).toBe(1);
  });

  it("withdraws only the clip's guard, so a new clip can be committed and the image cannot", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForClipRebuild(runId, sceneId);

    expect(countSceneResults(sceneId)).toBe(1);
    expect(clipGuardRows(sceneId)).toBe(0);
    expect(commitSceneVideoResult(sceneId, "scene-1-r1.mp4")).toBe(true);
    expect(commitSceneResult(sceneId, "scene-1-r1-attempt-1.png")).toBe(false);
  });

  it("keeps the bound providers, the requested duration and the narration interval", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForClipRebuild(runId, sceneId, "new video");

    expect(getScene(sceneId)).toMatchObject({
      provider: "image-provider-a",
      videoProvider: "video-provider-a",
      requestedDurationSeconds: 8,
      narrationInterval: { startSeconds: 1.5, endSeconds: 9.5 },
    });
  });

  it("does not touch another scene", () => {
    const runId = newRunId();
    const target = insertScene(runId, { idx: 1 });
    const other = insertScene(runId, { idx: 2 });
    const otherBefore = getScene(other);

    markSceneForClipRebuild(runId, target);

    expect(getScene(other)).toEqual(otherBefore);
    expect(clipGuardRows(other)).toBe(1);
  });
});

describe("the VIDEO instruction", () => {
  it("stores and records a given one", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForClipRebuild(runId, sceneId, "  slower camera  ");

    expect(getScene(sceneId)!.videoInstruction).toBe("slower camera");
    expect(JSON.parse(readFileSync(corrections(runId), "utf8")).scenes[sceneId]).toMatchObject({ videoInstruction: "slower camera" });
  });

  it("keeps the stored one and records nothing when none is given", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);

    markSceneForClipRebuild(runId, sceneId);

    expect(getScene(sceneId)!.videoInstruction).toBe("old video instruction");
    expect(() => readFileSync(corrections(runId), "utf8")).toThrow();
  });
});

describe("the final video's staleness", () => {
  it("marks an existing final video as older than the rebuilt clip", () => {
    const runId = newRunId();
    const sceneId = insertScene(runId);
    setFinalVideoPath(runId, "final-video.mp4");

    markSceneForClipRebuild(runId, sceneId);

    expect(getRun(runId)!.finalVideoStale).toBe(true);
  });

  it("marks nothing when the session has no final video, or the rebuild is refused", () => {
    const withoutVideo = newRunId();
    markSceneForClipRebuild(withoutVideo, insertScene(withoutVideo));
    expect(getRun(withoutVideo)!.finalVideoStale).toBe(false);

    const refused = newRunId();
    setFinalVideoPath(refused, "final-video.mp4");
    markSceneForClipRebuild(refused, insertScene(refused, { status: "video-generating" }));
    expect(getRun(refused)!.finalVideoStale).toBe(false);
  });
});
