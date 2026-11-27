import { getRun, getSceneForRun, getStageAttempts, markSceneForClipRebuild, markSceneForRebuild } from "./db.ts";
import { admitLaunch } from "./launchGate.ts";
import { broadcast, launchSceneStage, launchVideoStage } from "./orchestrator.ts";

// rebuild-scene (JOS-235), design Decision 2 — the one command behind "Rebuild scene". A refusal is decided entirely from
// the store; the write is conditional and the function has no `await`, so two calls cannot both be accepted.
// rebuild-scene-clip-only, design Decision 3 — `scope: "clip"` keeps the image and starts at the video stage.

export type SceneRebuildRefusal = "unknown-scene" | "scene-not-ready" | "assembly-in-progress";

export type SceneRebuildResult = { ok: true; held: boolean } | { ok: false; reason: SceneRebuildRefusal };

export type SceneRebuildScope = "image-and-clip" | "clip";

export function rebuildScene(
  sessionId: string,
  sceneId: string,
  request: { imageInstruction?: string; videoInstruction?: string; scope?: SceneRebuildScope },
): SceneRebuildResult {
  const run = getRun(sessionId);
  if (!run || !getSceneForRun(sessionId, sceneId)) return { ok: false, reason: "unknown-scene" };
  const assemblyRunning = getStageAttempts(sessionId, "assembly").some((attempt) => attempt.outcome === "in-flight");
  if (assemblyRunning || run.rebuildRequestedAt) return { ok: false, reason: "assembly-in-progress" };

  if (request.scope === "clip") {
    if (!markSceneForClipRebuild(sessionId, sceneId, request.videoInstruction)) return { ok: false, reason: "scene-not-ready" };
    launchVideoStage(sceneId);
  } else {
    const instructions = { imageInstruction: request.imageInstruction, videoInstruction: request.videoInstruction };
    if (!markSceneForRebuild(sessionId, sceneId, instructions)) return { ok: false, reason: "scene-not-ready" };
    launchSceneStage(sceneId);
  }
  broadcast(sessionId);
  return { ok: true, held: !admitLaunch(sessionId).admitted };
}
