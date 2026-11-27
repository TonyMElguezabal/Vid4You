import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssemblyInput, AssemblyResult, AssemblyTool } from "../src/assemblyTool.ts";
import type { AssemblyProgress } from "../src/assemblyProgress.ts";
import { commitSceneResult, getRun, getScenesForRun, markImageComplete, writeArtefactOnce } from "../src/db.ts";
import { events, launchVideoStageForRun, setAssemblyTool, toSnapshot } from "../src/orchestrator.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";
import { writeFileSync } from "node:fs";

// final-video-build-progress, spec "The session read carries the assembly progress" — design Decision 4: the latest
// progress per session, in memory, in the read only while an attempt runs, broadcast on each step change and at most
// once per second within a step.

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000007800000044000000000000000000000000000", "hex");
const MP4 = Buffer.from("00000020667479706d703432", "hex");

interface Pending {
  input: AssemblyInput;
  finish: (result: AssemblyResult) => void;
}

/** An assembly tool whose attempts the test drives: it reports progress and ends each attempt by hand. */
function drivenTool(attempts: Pending[]): AssemblyTool {
  return {
    assemble(input) {
      return new Promise((resolve) => attempts.push({ input, finish: resolve }));
    },
  };
}

const progressOf = (runId: string) => toSnapshot(runId)!.session.assemblyProgress;
const preparing = (clipsDone: number, percent: number): AssemblyProgress => ({ step: "preparing-clips", clipsDone, clipsTotal: 2, percent });
const encoding = (percent: number): AssemblyProgress => ({ step: "encoding", clipsDone: 2, clipsTotal: 2, percent });

let attempts: Pending[];
let broadcasts: Array<AssemblyProgress | undefined>;
const listener = (snapshot: SessionSnapshot) => broadcasts.push(snapshot.session.assemblyProgress);

beforeEach(() => {
  resetRebuildEnvironment();
  attempts = [];
  broadcasts = [];
  events.on("state", listener);
});

afterEach(() => {
  events.off("state", listener);
  vi.useRealTimers();
});

/** A two-scene session whose first assembly is running on the driven tool. */
async function assembling(): Promise<string> {
  const { runId } = await finishedSession({ finish: false });
  setAssemblyTool(drivenTool(attempts));
  const run = getRun(runId)!;
  for (const scene of getScenesForRun(runId)) {
    const rel = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, PNG);
    commitSceneResult(scene.id, rel);
    markImageComplete(scene.id, rel);
  }
  launchVideoStageForRun(runId);
  await waitFor(() => attempts.length === 1);
  broadcasts = [];
  return runId;
}

describe("the read", () => {
  it("carries no progress before the tool reports", async () => {
    const runId = await assembling();
    expect(progressOf(runId)).toBeUndefined();
  });

  it("carries the latest progress while the attempt runs", async () => {
    const runId = await assembling();
    attempts[0]!.input.onProgress!(preparing(1, 25));
    expect(progressOf(runId)).toEqual(preparing(1, 25));
  });

  it("drops it when the attempt succeeds", async () => {
    const runId = await assembling();
    attempts[0]!.input.onProgress!(encoding(90));
    writeFileSync(attempts[0]!.input.outputPath, MP4);
    attempts[0]!.finish({ kind: "success", outputPath: attempts[0]!.input.outputPath });

    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video.mp4");
    expect(progressOf(runId)).toBeUndefined();
    expect(broadcasts.at(-1)).toBeUndefined();
  });

  it("drops it when the attempt fails", async () => {
    const runId = await assembling();
    attempts[0]!.input.onProgress!(encoding(60));
    attempts[0]!.finish({ kind: "failed_not_retryable", reason: "stub failure" });

    await waitFor(() => getRun(runId)?.failure !== null && getRun(runId)?.failure !== undefined);
    expect(progressOf(runId)).toBeUndefined();
  });

  it("drops it between a transient failure and the retry", async () => {
    const runId = await assembling();
    attempts[0]!.input.onProgress!(encoding(60));
    attempts[0]!.finish({ kind: "failed_transient", reason: "stub transient" });

    await waitFor(() => attempts.length === 2);
    expect(progressOf(runId)).toBeUndefined();
    attempts[1]!.input.onProgress!(preparing(0, 0));
    expect(progressOf(runId)).toEqual(preparing(0, 0));
  });
});

describe("the live updates", () => {
  it("are sent on each change of step", async () => {
    await assembling();
    const report = attempts[0]!.input.onProgress!;

    report(preparing(0, 0));
    report(encoding(50));

    expect(broadcasts).toEqual([preparing(0, 0), encoding(50)]);
  });

  it("are sent at most once per second within a step", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await assembling();
    const report = attempts[0]!.input.onProgress!;

    report(encoding(50));
    for (let percent = 51; percent <= 60; percent++) report(encoding(percent));
    expect(broadcasts).toEqual([encoding(50)]);

    vi.advanceTimersByTime(1_000);
    report(encoding(61));
    expect(broadcasts).toEqual([encoding(50), encoding(61)]);
  });
});
