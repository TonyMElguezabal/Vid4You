import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FFMPEG, FFPROBE } from "../src/config/ffmpeg.ts";
import { deepestDip, ffmpegLevelTools, levelIfNeeded, maxGainStep, needsLeveling, windowLevels, type LevelTools } from "../src/voiceLevel.ts";

// level-voice-over-volume — the decision rule, tested on numbers: per-second RMS loudness (dBFS), 10-second windows,
// a dip is a window more than 6 dB under the median window.

const REAL = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "voice-level", "second-levels.json"), "utf8")) as Record<string, number[]>;

/** `seconds` seconds at a constant level. */
const flat = (level: number, seconds: number): number[] => Array.from({ length: seconds }, () => level);
const SILENCE = -120;

describe("windowLevels", () => {
  it("measures consecutive 10-second windows of speech", () => {
    expect(windowLevels([...flat(-20, 10), ...flat(-30, 10)])).toEqual([-20, -30]);
  });

  it("ignores silence and skips a window with fewer than 4 seconds of speech", () => {
    const levels = [...flat(-20, 3), ...flat(SILENCE, 7), ...flat(-25, 10)];
    expect(windowLevels(levels)).toEqual([-25]);
  });

  it("keeps a partial last window that has enough speech, and drops one that has not", () => {
    expect(windowLevels([...flat(-20, 10), ...flat(-30, 5)])).toEqual([-20, -30]);
    expect(windowLevels([...flat(-20, 10), ...flat(-30, 3)])).toEqual([-20]);
  });

  it("does not let a pause inside a window pull its level down", () => {
    const levels = [...flat(-20, 6), ...flat(SILENCE, 4)];
    expect(windowLevels(levels)).toEqual([-20]);
  });

  it("returns nothing for empty or silent audio", () => {
    expect(windowLevels([])).toEqual([]);
    expect(windowLevels(flat(SILENCE, 60))).toEqual([]);
  });
});

describe("needsLeveling", () => {
  it("leaves flat audio alone", () => {
    expect(needsLeveling(flat(-22, 120))).toBe(false);
  });

  it("levels audio with a dip well beyond the trigger", () => {
    expect(needsLeveling([...flat(-20, 50), ...flat(-28, 10), ...flat(-20, 50)])).toBe(true);
  });

  it("leaves a dip of exactly 6 dB alone and levels one of 6.1 dB", () => {
    expect(needsLeveling([...flat(-20, 50), ...flat(-26, 10), ...flat(-20, 50)])).toBe(false);
    expect(needsLeveling([...flat(-20, 50), ...flat(-26.1, 10), ...flat(-20, 50)])).toBe(true);
  });

  it("does not count a quiet stretch shorter than one window as a dip", () => {
    const levels = [...flat(-20, 55), ...flat(-35, 3), ...flat(-20, 62)];
    expect(needsLeveling(levels)).toBe(false);
  });

  it("does not count pauses as dips", () => {
    expect(needsLeveling([...flat(-20, 50), ...flat(SILENCE, 30), ...flat(-20, 50)])).toBe(false);
  });

  it("does not judge audio with fewer than 3 measured windows", () => {
    expect(needsLeveling([...flat(-20, 10), ...flat(-40, 10)])).toBe(false);
  });

  it("detects a dip in the first and in the last window", () => {
    expect(needsLeveling([...flat(-30, 10), ...flat(-20, 60)])).toBe(true);
    expect(needsLeveling([...flat(-20, 60), ...flat(-30, 10)])).toBe(true);
  });

  it("is not thrown off by a few loud windows", () => {
    expect(needsLeveling([...flat(-12, 20), ...flat(-20, 50), ...flat(-21, 30)])).toBe(false);
  });

  it("levels the real sessions whose voice faded: the original, a regeneration and a stability 0.75 regeneration", () => {
    expect(needsLeveling(REAL.original!)).toBe(true);
    expect(needsLeveling(REAL.regeneration!)).toBe(true);
    expect(needsLeveling(REAL.stability!)).toBe(true);
  });
});

describe("deepestDip", () => {
  it("is 0 when no window is under the median", () => {
    expect(deepestDip(flat(-20, 60))).toBe(0);
  });

  it("measures the deepest window against the median, in dB", () => {
    expect(deepestDip([...flat(-20, 50), ...flat(-29, 10), ...flat(-20, 50)])).toBeCloseTo(9, 5);
  });

  it("finds the measured depth of the real fades", () => {
    expect(deepestDip(REAL.original!)).toBeGreaterThan(6);
    expect(deepestDip(REAL.original!)).toBeLessThan(8.5);
    expect(deepestDip(REAL.regeneration!)).toBeGreaterThan(11);
  });
});

describe("maxGainStep", () => {
  it("is 0 when the audio is unchanged", () => {
    expect(maxGainStep(flat(-20, 30), flat(-20, 30))).toBe(0);
  });

  it("is the largest change of the applied gain between two consecutive seconds of speech", () => {
    const original = flat(-20, 6);
    const levelled = [-20, -20, -18, -14, -14, -14];
    expect(maxGainStep(original, levelled)).toBe(4);
  });

  it("ignores seconds where either side is silence", () => {
    const original = [-20, SILENCE, -20];
    const levelled = [-20, SILENCE, -10];
    expect(maxGainStep(original, levelled)).toBe(0);
  });

  it("tells the fast levelling of a real session (a sudden boost) from the smooth one", () => {
    expect(maxGainStep(REAL.regeneration!, REAL["regeneration-levelled-fast"]!)).toBeGreaterThan(2);
    expect(maxGainStep(REAL.regeneration!, REAL["regeneration-levelled-smooth"]!)).toBeLessThanOrEqual(2);
  });
});

// The acceptance gate, on fake tools: the levelled audio replaces the provider's only if it is better, the same length,
// not clipped and smooth. Whatever goes wrong, the provider's audio is what is stored.
const ORIGINAL = Uint8Array.from([1, 2, 3]);
const LEVELLED = Uint8Array.from([4, 5, 6]);
const FADED = [...flat(-20, 50), ...flat(-30, 10), ...flat(-20, 50)];
/** The original plus a gain that rises and falls by 0.8 dB a second over the dip: an improvement that is smooth. */
const SMOOTHLY_LEVELLED = FADED.map((level, second) => level + (second < 50 ? 0 : second < 60 ? (second - 49) * 0.8 : second < 70 ? (70 - second) * 0.8 : 0));
/** The same improvement as a sudden boost of 8 dB. */
const SUDDENLY_LEVELLED = FADED.map((level, second) => level + (second >= 50 && second < 60 ? 8 : 0));

function fakeTools(overrides: { levelledSecondLevels?: number[]; levelledDuration?: number; levelledPeak?: number; failMeasure?: boolean; failLevel?: boolean }): LevelTools & { levelCalls: number } {
  const tools = {
    levelCalls: 0,
    measure: (audio: Uint8Array) => {
      if (overrides.failMeasure) return Promise.reject(new Error("ffmpeg could not start"));
      return Promise.resolve(audio === ORIGINAL ? FADED : (overrides.levelledSecondLevels ?? SMOOTHLY_LEVELLED));
    },
    level: () => {
      tools.levelCalls++;
      return overrides.failLevel ? Promise.reject(new Error("filter failed")) : Promise.resolve(LEVELLED);
    },
    durationSeconds: (audio: Uint8Array) => Promise.resolve(audio === ORIGINAL ? 110 : (overrides.levelledDuration ?? 110)),
    peakDb: () => Promise.resolve(overrides.levelledPeak ?? -3),
  };
  return tools;
}

describe("levelIfNeeded (the acceptance gate)", () => {
  it("stores the provider's audio untouched when there is no dip, without levelling", async () => {
    const tools = { ...fakeTools({}), measure: () => Promise.resolve(flat(-20, 110)) };
    const outcome = await levelIfNeeded(ORIGINAL, 110, tools);
    expect(outcome.audio).toBe(ORIGINAL);
    expect(outcome.levelled).toBe(false);
    expect(outcome.reason).toBeUndefined();
  });

  it("stores the levelled audio when it is better, the same length, not clipped and smooth", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({}));
    expect(outcome.audio).toBe(LEVELLED);
    expect(outcome.levelled).toBe(true);
    expect(outcome.durationSeconds).toBe(110);
    expect(outcome.dipAfter!).toBeLessThan(outcome.dipBefore!);
  });

  it("keeps the provider's audio when levelling does not improve the deepest dip", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledSecondLevels: FADED }));
    expect(outcome).toMatchObject({ levelled: false, reason: "not-improved" });
    expect(outcome.audio).toBe(ORIGINAL);
  });

  it("keeps the provider's audio when the levelled one would clip", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledPeak: -0.5 }));
    expect(outcome).toMatchObject({ levelled: false, reason: "clipped" });
    expect(outcome.audio).toBe(ORIGINAL);
  });

  it("accepts a peak of exactly -1 dBFS", async () => {
    expect((await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledPeak: -1 }))).levelled).toBe(true);
  });

  it("keeps the provider's audio when the length changes by more than one frame", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledDuration: 110.1 }), 30);
    expect(outcome).toMatchObject({ levelled: false, reason: "length-changed" });
    expect(outcome.audio).toBe(ORIGINAL);
  });

  it("accepts a length that differs by less than one frame", async () => {
    expect((await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledDuration: 110.02 }), 30)).levelled).toBe(true);
  });

  it("keeps the provider's audio when the gain jumps by more than 2 dB between two seconds", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ levelledSecondLevels: SUDDENLY_LEVELLED }));
    expect(outcome).toMatchObject({ levelled: false, reason: "not-smooth" });
    expect(outcome.audio).toBe(ORIGINAL);
  });

  it("keeps the provider's audio, without throwing, when measuring fails", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ failMeasure: true }));
    expect(outcome).toMatchObject({ levelled: false, reason: "tool-failed" });
    expect(outcome.audio).toBe(ORIGINAL);
  });

  it("keeps the provider's audio, without throwing, when levelling fails", async () => {
    const outcome = await levelIfNeeded(ORIGINAL, 110, fakeTools({ failLevel: true }));
    expect(outcome).toMatchObject({ levelled: false, reason: "tool-failed" });
    expect(outcome.audio).toBe(ORIGINAL);
  });
});

// Real ffmpeg on generated audio: a tone whose volume fades 10 dB over 20 s, stays down for 20 s and comes back over 10 s.
const haveFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0 && spawnSync(FFPROBE, ["-version"]).status === 0;
const FADE_DB = "if(lt(t,30),0,if(lt(t,50),-(t-30)*0.5,if(lt(t,70),-10,if(lt(t,80),-10+(t-70),0))))";

function generateTone(seconds: number, faded: boolean): Uint8Array {
  const folder = mkdtempSync(join(tmpdir(), "vid4you-level-test-"));
  try {
    const out = join(folder, "tone.mp3");
    const volume = faded ? `,volume='pow(10,(${FADE_DB})/20)':eval=frame` : "";
    execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=44100:duration=${seconds}`, "-af", `volume=0.5${volume}`, "-c:a", "libmp3lame", "-b:a", "128k", out]);
    return readFileSync(out);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe.skipIf(!haveFfmpeg)("levelIfNeeded (real ffmpeg, generated audio)", () => {
  it("detects the fade, levels it, and keeps the length, the peak and the smoothness inside the limits", async () => {
    const audio = generateTone(120, true);
    const duration = await ffmpegLevelTools.durationSeconds(audio);

    const outcome = await levelIfNeeded(audio, duration, ffmpegLevelTools, 30);

    expect(outcome.reason).toBeUndefined();
    expect(outcome.levelled).toBe(true);
    expect(Math.abs(outcome.durationSeconds - duration)).toBeLessThanOrEqual(1 / 30);
    expect(await ffmpegLevelTools.peakDb(outcome.audio)).toBeLessThanOrEqual(-1);
    const before = await ffmpegLevelTools.measure(audio);
    const after = await ffmpegLevelTools.measure(outcome.audio);
    expect(deepestDip(after)).toBeLessThan(deepestDip(before));
    expect(maxGainStep(before, after)).toBeLessThanOrEqual(2);
  }, 60_000);

  it("stores a flat file byte for byte", async () => {
    const audio = generateTone(60, false);
    const outcome = await levelIfNeeded(audio, await ffmpegLevelTools.durationSeconds(audio), ffmpegLevelTools, 30);
    expect(outcome.levelled).toBe(false);
    expect(outcome.audio).toBe(audio);
  }, 60_000);
});
