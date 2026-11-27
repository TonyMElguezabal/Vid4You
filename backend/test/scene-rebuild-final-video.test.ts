import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitSceneResult,
  db,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resolveArtefactPath,
  setScenePauseEdit,
  writeArtefactOnce,
} from "../src/db.ts";
import { rebuildFinalVideo } from "../src/finalVideoRebuild.ts";
import { continueSession, launchVideoStageForRun, pauseSession, recoverOnBoot, toSnapshot } from "../src/orchestrator.ts";
import { rebuildScene } from "../src/sceneRebuild.ts";
import { getStageAttempts } from "../src/db.ts";
import { resetImageProviderRegistry, setImageProviderRegistry, type ImageProvider } from "../src/imageProvider.ts";
import { finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";
import { imageProviderFromGenerate } from "./imageProviderFixtures.ts";

// rebuild-scene (JOS-235), design Decisions 5-8, changed by redo-scene-narration (JOS-282), design Decision 15 — a rebuilt
// scene marks an existing final video stale and never rebuilds it by itself: the User checks the scenes, then uses
// "Rebuild final video". A session with no final video still assembles by itself.

const IMAGE_PROVIDER = "test-image-provider";

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const ACCEPTED_PNG = buildPng(1920, 1088);

/** An image provider that answers at once, except for an instruction containing "slow", which waits for `release()`. */
function controllableImageProvider(): { provider: ImageProvider; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const provider: ImageProvider = imageProviderFromGenerate(async (instruction) => {
    if (instruction.includes("slow")) await gate;
    return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
  });
  return { provider, release: () => release() };
}

let imageGate: ReturnType<typeof controllableImageProvider>;

beforeEach(() => {
  resetRebuildEnvironment();
  imageGate = controllableImageProvider();
  setImageProviderRegistry({ defaultIdentifier: IMAGE_PROVIDER, adapters: { [IMAGE_PROVIDER]: imageGate.provider } });
});

afterEach(() => {
  resetImageProviderRegistry();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("a session with a final video", () => {
  it("is not rebuilt by itself after a scene rebuild; the User's rebuild gives version 2 with the new clip", async () => {
    const { runId, sceneIds, calls } = await finishedSession();

    expect(rebuildScene(runId, sceneIds[0]!, { imageInstruction: "fixed image" })).toEqual({ ok: true, held: false });
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);
    await settle();
    expect(calls).toHaveLength(1);
    expect(getRun(runId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true, rebuildRequestedAt: null });
    expect(toSnapshot(runId)!.session.finalVideo).toMatchObject({ version: 1, staleScenes: true });

    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(calls[1]!.clips[1]!.clipPath).toBe(calls[0]!.clips[1]!.clipPath);
    const run = getRun(runId)!;
    expect(run.finalVideoStale).toBe(false);
    expect(existsSync(resolveArtefactPath(run.projectFolder, "final-video.mp4"))).toBe(true);
    expect(getStageAttempts(runId, "assembly").map((attempt) => attempt.cycle)).toEqual([1, 2]);
  });

  it("starts no assembly after two rebuilt scenes complete", async () => {
    const { runId, sceneIds, calls } = await finishedSession();

    rebuildScene(runId, sceneIds[0]!, {});
    rebuildScene(runId, sceneIds[1]!, { imageInstruction: "slow fix" });
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "scenes-not-complete" });

    imageGate.release();
    await waitFor(() => getScene(sceneIds[1]!)?.status === "chunk-complete" && getScene(sceneIds[1]!)?.rebuildCount === 1);
    await settle();
    expect(calls).toHaveLength(1);
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls[1]!.clips.map((clip) => clip.clipPath.split("/").at(-1))).toEqual(["scene-1-r1.mp4", "scene-2-r1.mp4"]);
  });

  it("does not rebuild a stale final video on continue", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    rebuildScene(runId, sceneIds[0]!, {});
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);

    expect(pauseSession(runId).ok).toBe(true);
    expect(continueSession(runId).ok).toBe(true);

    await settle();
    expect(calls).toHaveLength(1);
    expect(getRun(runId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true });
  });

  it("does not rebuild a stale final video after a restart, and keeps offering Rebuild final video", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    rebuildScene(runId, sceneIds[0]!, {});
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);

    recoverOnBoot();

    await settle();
    expect(calls).toHaveLength(1);
    expect(getRun(runId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true, rebuildRequestedAt: null });
    expect(toSnapshot(runId)!.session.finalVideo?.staleScenes).toBe(true);
  });

  it("keeps the previous final video and the stale mark when the User's rebuild fails, and offers Rebuild final video again", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession();
    rebuildScene(runId, sceneIds[0]!, {});
    await waitFor(() => getScene(sceneIds[0]!)?.status === "chunk-complete" && getScene(sceneIds[0]!)?.rebuildCount === 1);
    setMode("not-retryable");

    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getStageAttempts(runId, "assembly").at(-1)?.outcome === "not-retryable");

    const run = getRun(runId)!;
    expect(run.finalVideoPath).toBe("final-video.mp4");
    expect(run.failure).toBeNull();
    expect(run.finalVideoStale).toBe(true);
    expect(run.rebuildRequestedAt).toBeNull();
    const snapshot = toSnapshot(runId)!.session;
    expect(snapshot.state).toBe("final-video");
    expect(snapshot.finalVideo).toMatchObject({ staleScenes: true, pendingPauseEdits: false });
    expect(snapshot.finalVideo?.rebuildFailure).toBeDefined();

    setMode("success");
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls.at(-1)!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(getRun(runId)!.finalVideoStale).toBe(false);
  });
});

describe("a session whose assembly failed", () => {
  it("assembles again by itself after a scene is rebuilt, and ends with its final video", async () => {
    const { runId, sceneIds, calls, setMode } = await finishedSession({ finish: false });
    setMode("not-retryable");
    const run = getRun(runId)!;
    for (const scene of getScenesForRun(runId)) {
      const image = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
      commitSceneResult(scene.id, image);
      markImageComplete(scene.id, image);
    }
    launchVideoStageForRun(runId);
    await waitFor(() => getRun(runId)?.failure?.phase === "assembly");
    expect(getRun(runId)!.finalVideoPath).toBeNull();
    setMode("success");

    rebuildScene(runId, sceneIds[0]!, {});

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video.mp4");
    expect(getRun(runId)!.failure).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.clips[0]!.clipPath).toMatch(/scene-1-r1\.mp4$/);
    expect(toSnapshot(runId)!.session.state).toBe("final-video");
  });
});

describe("Rebuild final video (design Decision 7)", () => {
  it("is refused with scenes-not-complete while a scene is not complete, even with pause edits pending", async () => {
    const { runId, sceneIds, calls } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    db.prepare("UPDATE scenes SET status = 'image-generating' WHERE id = ?").run(sceneIds[1]!);

    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "scenes-not-complete" });

    expect(getRun(runId)!.rebuildRequestedAt).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(1);
  });

  it("is still refused with nothing-to-rebuild when there are no pause edits and no rebuilt scene", async () => {
    const { runId } = await finishedSession();

    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "nothing-to-rebuild" });
  });
});
