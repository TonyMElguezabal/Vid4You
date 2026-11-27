// assemble-final-video (JOS-149) — test stubs for AssemblyTool.
// Replaces the real ffmpeg adapter in unit and integration tests; modes map
// to the three result kinds the phase's retry policy must handle.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AssemblyInput, AssemblyResult, AssemblyTool } from "./assemblyTool.ts";
import { createAssemblyProgress } from "./assemblyProgress.ts";

export type StubAssemblyMode =
  | { kind: "success" }
  | { kind: "transient-failure"; reason?: string }
  | { kind: "not-retryable-failure"; reason?: string }
  /** Manual endpoint testing only (JOS-161, task 5.1): succeeds after `delayMs`, so an assembly can be paused during it. */
  | { kind: "slow-success"; delayMs: number };

// verify-internal-workflow (JOS-243), design D4 — a succeeding stub leaves a placeholder at the output path, so the
// final-video download serves a file. It is not a playable MP4. A file already there is kept: some tests write real
// bytes and then call this stub.
function writePlaceholder(outputPath: string): AssemblyResult {
  if (!existsSync(outputPath)) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, "stub final video");
  }
  return { kind: "success", outputPath };
}

/**
 * final-video-build-progress, design Decision 3 — reports both steps through the real tracker: at once with no delay,
 * or spread over `delayMs` (half for the clips, half for four encode reports) so a page can watch the bar.
 */
async function reportStubProgress(input: AssemblyInput, delayMs = 0): Promise<void> {
  const frameCounts = input.clips.map((clip) => clip.frameCount);
  const progress = createAssemblyProgress(frameCounts, (report) => input.onProgress?.(report));
  const wait = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
  for (let index = 0; index < frameCounts.length; index++) {
    progress.clipStarted(index);
    await wait(delayMs / 2 / frameCounts.length);
    progress.clipFinished(index);
  }
  if (frameCounts.length === 0) await wait(delayMs / 2); // the whole delay is still spent
  progress.encodingStarted();
  const videoFrames = frameCounts.reduce((sum, count) => sum + count, 0);
  for (let quarter = 1; quarter <= 4; quarter++) {
    await wait(delayMs / 8);
    progress.frames((videoFrames * quarter) / 4);
  }
}

export function createStubAssemblyTool(mode: StubAssemblyMode = { kind: "success" }): AssemblyTool {
  return {
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      switch (mode.kind) {
        case "success":
          await reportStubProgress(input);
          return writePlaceholder(input.outputPath);
        case "transient-failure":
          return { kind: "failed_transient", reason: mode.reason ?? "stub transient failure" };
        case "not-retryable-failure":
          return { kind: "failed_not_retryable", reason: mode.reason ?? "stub not-retryable failure" };
        case "slow-success":
          await reportStubProgress(input, mode.delayMs);
          return writePlaceholder(input.outputPath);
      }
    },
  };
}

/** A snapshot of an AssemblyInput received by the capturing stub. */
export type CapturedAssemblyInput = AssemblyInput;

/** Stub that records every AssemblyInput it receives (for test assertions on what the phase builds). */
export function createCapturingAssemblyTool(captures: CapturedAssemblyInput[]): AssemblyTool {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- implements the async AssemblyTool contract
    async assemble(input: AssemblyInput): Promise<AssemblyResult> {
      captures.push({ ...input, clips: [...input.clips], ...(input.narrationEdits ? { narrationEdits: [...input.narrationEdits] } : {}) });
      return { kind: "success", outputPath: input.outputPath };
    },
  };
}
