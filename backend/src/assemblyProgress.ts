// final-video-build-progress, design Decisions 2 and 3 — how far a final-video assembly is. Both steps encode every
// frame of the video once (each clip while it is prepared, then all of them in the final encode), so the percentage is
// the frames encoded so far out of twice the video's frames. It never goes back, and only a success is 100.

export interface AssemblyProgress {
  step: "preparing-clips" | "encoding";
  clipsDone: number;
  clipsTotal: number;
  /** 0 to 99 while the attempt runs. */
  percent: number;
}

export interface AssemblyProgressTracker {
  clipStarted(index: number): void;
  clipFinished(index: number): void;
  encodingStarted(): void;
  /** ffmpeg's `frame=` for the clip or the encode in progress. */
  frames(count: number): void;
}

export function createAssemblyProgress(frameCounts: readonly number[], report: (progress: AssemblyProgress) => void): AssemblyProgressTracker {
  const videoFrames = frameCounts.reduce((sum, count) => sum + count, 0);
  const total = Math.max(1, 2 * videoFrames);
  let step: AssemblyProgress["step"] = "preparing-clips";
  let clipsDone = 0;
  let framesBefore = 0; // frames of the finished work: the finished clips, or every clip once encoding
  let currentTarget = 0; // frames the clip or encode in progress will write
  let percent = 0;

  function emit(currentFrames: number): void {
    const done = framesBefore + Math.min(Math.max(0, currentFrames), currentTarget);
    percent = Math.max(percent, Math.min(99, Math.floor((100 * done) / total)));
    report({ step, clipsDone, clipsTotal: frameCounts.length, percent });
  }

  return {
    clipStarted(index) {
      currentTarget = frameCounts[index] ?? 0;
      emit(0);
    },
    clipFinished(index) {
      framesBefore += frameCounts[index] ?? 0;
      clipsDone = index + 1;
      currentTarget = 0;
      emit(0);
    },
    encodingStarted() {
      step = "encoding";
      clipsDone = frameCounts.length;
      framesBefore = videoFrames;
      currentTarget = videoFrames;
      emit(0);
    },
    frames(count) {
      emit(count);
    },
  };
}
