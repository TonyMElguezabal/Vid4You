import { describe, expect, it } from "vitest";
import { createAssemblyProgress, type AssemblyProgress } from "../src/assemblyProgress.ts";

// final-video-build-progress, design Decision 2 — progress is the share of frames encoded over both steps: each clip
// once while it is prepared, then every frame once more in the final encode.

function track(frameCounts: number[]) {
  const reports: AssemblyProgress[] = [];
  const progress = createAssemblyProgress(frameCounts, (report) => reports.push(report));
  return { progress, reports, last: () => reports.at(-1)! };
}

describe("preparing the clips", () => {
  it("starts at 0 with no clip done", () => {
    const { progress, last } = track([30, 30]);
    progress.clipStarted(0);
    expect(last()).toEqual({ step: "preparing-clips", clipsDone: 0, clipsTotal: 2, percent: 0 });
  });

  it("counts each finished clip, weighted by its frames", () => {
    const { progress, last } = track(Array.from({ length: 70 }, () => 30));
    for (let index = 0; index < 35; index++) {
      progress.clipStarted(index);
      progress.clipFinished(index);
    }
    expect(last()).toEqual({ step: "preparing-clips", clipsDone: 35, clipsTotal: 70, percent: 25 });
  });

  it("moves within a clip with ffmpeg's frame reports", () => {
    const { progress, last } = track([100, 100]);
    progress.clipStarted(0);
    progress.frames(50);
    expect(last()).toMatchObject({ clipsDone: 0, percent: 12 });
  });

  it("caps a frame report above the clip's target", () => {
    const { progress, last } = track([100, 100]);
    progress.clipStarted(0);
    progress.frames(500);
    expect(last()).toMatchObject({ percent: 25 });
  });
});

describe("encoding", () => {
  it("starts at 50% once every clip is prepared", () => {
    const { progress, last } = track([30, 30]);
    progress.clipStarted(0);
    progress.clipFinished(0);
    progress.clipStarted(1);
    progress.clipFinished(1);
    progress.encodingStarted();
    expect(last()).toEqual({ step: "encoding", clipsDone: 2, clipsTotal: 2, percent: 50 });
  });

  it("is at 75% when half of the frames are encoded", () => {
    const { progress, last } = track([30, 30]);
    progress.encodingStarted();
    progress.frames(30);
    expect(last()).toMatchObject({ step: "encoding", percent: 75 });
  });

  it("never reports 100, even with every frame encoded", () => {
    const { progress, last } = track([30, 30]);
    progress.encodingStarted();
    progress.frames(60);
    expect(last().percent).toBe(99);
  });
});

it("never goes back", () => {
  const { progress, reports } = track([100, 100]);
  progress.clipStarted(0);
  progress.frames(80);
  progress.frames(10); // a late or reordered report
  progress.clipFinished(0);
  const percents = reports.map((report) => report.percent);
  expect(percents).toEqual([...percents].sort((a, b) => a - b));
});
