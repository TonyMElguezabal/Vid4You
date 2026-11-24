import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE } from "./config/ffmpeg.ts";
import { FINAL_OUTPUT } from "./config/providers.ts";

// level-voice-over-volume — a voice-over whose volume drifts (10 to 60 second fades, 6 to 12 dB, that come back) is
// levelled once before it is stored; a clean one is stored byte for byte. The decision is made on numbers, so these
// functions take per-second loudness (dBFS RMS) and touch no audio.

export const LEVEL = {
  /** Length of one loudness window. */
  windowSeconds: 10,
  /** A window needs this many seconds of speech to be judged. */
  minSpeechSeconds: 4,
  /** A second under this level is silence and is ignored. */
  silenceDb: -45,
  /** A window this much under the median window (strictly more) is a dip. */
  triggerDb: 6,
  /** Audio with fewer measured windows than this is not judged. */
  minWindows: 3,
} as const;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * The level of each 10-second window: the 75th percentile of its speech seconds, so a pause inside the window does
 * not pull it down. A window with too little speech is skipped.
 */
export function windowLevels(secondLevels: readonly number[]): number[] {
  const levels: number[] = [];
  for (let start = 0; start < secondLevels.length; start += LEVEL.windowSeconds) {
    const speech = secondLevels
      .slice(start, start + LEVEL.windowSeconds)
      .filter((level) => level > LEVEL.silenceDb)
      .sort((a, b) => a - b);
    if (speech.length >= LEVEL.minSpeechSeconds) levels.push(speech[Math.floor((speech.length * 3) / 4)]!);
  }
  return levels;
}

/** How far, in dB, the quietest window is under the median window; 0 when none is, or when there is too little to judge. */
export function deepestDip(secondLevels: readonly number[]): number {
  const windows = windowLevels(secondLevels);
  if (windows.length < LEVEL.minWindows) return 0;
  return Math.max(0, median(windows) - Math.min(...windows));
}

/** True when some window is more than the trigger under the median window. */
export function needsLeveling(secondLevels: readonly number[]): boolean {
  return deepestDip(secondLevels) > LEVEL.triggerDb;
}

/**
 * The largest change of the gain a levelling applied between two consecutive seconds of speech: levelled loudness
 * minus original loudness, a second at a time. A sudden boost when the voice fades shows up here.
 */
export function maxGainStep(original: readonly number[], levelled: readonly number[]): number {
  const length = Math.min(original.length, levelled.length);
  let largest = 0;
  let previous: number | null = null;
  for (let second = 0; second < length; second++) {
    const before = original[second]!;
    const after = levelled[second]!;
    if (before <= LEVEL.silenceDb || after <= LEVEL.silenceDb) {
      previous = null;
      continue;
    }
    const gain = after - before;
    if (previous !== null) largest = Math.max(largest, Math.abs(gain - previous));
    previous = gain;
  }
  return largest;
}

// ---- Levelling: the tools, and the gate that decides whether their result is stored ----

/** The levelled audio's loudest peak may not pass this (dBFS). */
export const PEAK_LIMIT_DB = -1;
/** The applied gain may not change by more than this (dB) between two consecutive seconds of speech. */
export const MAX_GAIN_STEP_DB = 2;
/**
 * Slow gain changes: a 1.5 s analysis frame and a 15-frame (about 22 s) smoothing window, shorter than the 10 to 60 s
 * fades it repairs. A faster setting (f=300:g=51) repaired the same fades with sudden boosts of up to 2.8 dB a second.
 */
export const LEVEL_FILTER = "dynaudnorm=f=1500:g=15:m=20:p=0.85:b=1";

export interface LevelTools {
  /** Loudness (dBFS RMS) of each second of the audio. */
  measure(audio: Uint8Array): Promise<number[]>;
  /** The audio, levelled and encoded as an MP3. */
  level(audio: Uint8Array): Promise<Uint8Array>;
  durationSeconds(audio: Uint8Array): Promise<number>;
  /** The loudest peak (dBFS). */
  peakDb(audio: Uint8Array): Promise<number>;
}

export type LevelSkipReason = "not-improved" | "clipped" | "length-changed" | "not-smooth" | "tool-failed";

export interface LevelOutcome {
  /** What to store: the levelled audio, or the provider's untouched. */
  audio: Uint8Array;
  durationSeconds: number;
  levelled: boolean;
  /** Set when a dip was found but the provider's audio is stored anyway. */
  reason?: LevelSkipReason;
  dipBefore?: number;
  dipAfter?: number;
}

const execFileAsync = promisify(execFile);

/** Runs `use` on a temp file holding the audio and always removes the folder. */
async function withAudioFile<T>(audio: Uint8Array, use: (folder: string, file: string) => Promise<T>): Promise<T> {
  const folder = mkdtempSync(join(tmpdir(), "vid4you-level-"));
  try {
    writeFileSync(join(folder, "in.mp3"), audio);
    return await use(folder, "in.mp3");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export const ffmpegLevelTools: LevelTools = {
  measure: (audio) =>
    withAudioFile(audio, async (folder, file) => {
      // Relative file names and a working folder keep the filtergraph free of paths that would need escaping.
      await execFileAsync(
        FFMPEG,
        ["-hide_banner", "-v", "error", "-i", file, "-af", "aresample=44100,asetnsamples=n=44100:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=levels.txt", "-f", "null", "-"],
        { cwd: folder },
      );
      const text = readFileSync(join(folder, "levels.txt"), "utf8");
      return [...text.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((match) => (match[1] === "-inf" ? -120 : Number(match[1])));
    }),

  level: (audio) =>
    withAudioFile(audio, async (folder, file) => {
      await execFileAsync(FFMPEG, ["-hide_banner", "-v", "error", "-y", "-i", file, "-af", LEVEL_FILTER, "-c:a", "libmp3lame", "-b:a", "128k", "out.mp3"], { cwd: folder });
      return readFileSync(join(folder, "out.mp3"));
    }),

  durationSeconds: (audio) =>
    withAudioFile(audio, async (folder, file) => {
      const { stdout } = await execFileAsync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: folder });
      return Number(stdout.trim());
    }),

  peakDb: (audio) =>
    withAudioFile(audio, async (folder, file) => {
      const { stderr } = await execFileAsync(FFMPEG, ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { cwd: folder });
      const peak = /max_volume: (-?[\d.]+) dB/.exec(stderr);
      if (!peak) throw new Error("the peak could not be measured");
      return Number(peak[1]);
    }),
};

/**
 * Levels the audio once when its loudness drifts, and returns what to store. The provider's audio comes back untouched
 * when there is no dip, and also when levelling does not help, clips, changes the length, is not smooth, or any tool
 * fails: this step never fails a session. The length may differ by at most one frame of the final video.
 */
export async function levelIfNeeded(
  audio: Uint8Array,
  durationSeconds: number,
  tools: LevelTools = ffmpegLevelTools,
  fps: number = FINAL_OUTPUT.fps,
): Promise<LevelOutcome> {
  const untouched = (reason?: LevelSkipReason, dips: { dipBefore?: number; dipAfter?: number } = {}): LevelOutcome => ({
    audio,
    durationSeconds,
    levelled: false,
    ...(reason ? { reason } : {}),
    ...dips,
  });
  try {
    const before = await tools.measure(audio);
    if (!needsLeveling(before)) return untouched();

    const levelled = await tools.level(audio);
    const after = await tools.measure(levelled);
    const dipBefore = deepestDip(before);
    const dipAfter = deepestDip(after);
    const levelledDuration = await tools.durationSeconds(levelled);

    if (!(dipAfter < dipBefore)) return untouched("not-improved", { dipBefore, dipAfter });
    if ((await tools.peakDb(levelled)) > PEAK_LIMIT_DB) return untouched("clipped", { dipBefore, dipAfter });
    if (Math.abs(levelledDuration - durationSeconds) > 1 / fps) return untouched("length-changed", { dipBefore, dipAfter });
    if (maxGainStep(before, after) > MAX_GAIN_STEP_DB) return untouched("not-smooth", { dipBefore, dipAfter });
    return { audio: levelled, durationSeconds: levelledDuration, levelled: true, dipBefore, dipAfter };
  } catch {
    return untouched("tool-failed");
  }
}
