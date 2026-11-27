import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FFMPEG, FFPROBE } from "../src/config/ffmpeg.ts";
import { decodedShape, matchGain, MAX_TAKE_GAIN_DB, measureSpeech, probeDurationSeconds, spliceNarration, writePreview } from "../src/narrationTakeAudio.ts";
import { planTakeFit } from "../src/narrationTakeFit.ts";

// redo-scene-narration (JOS-282), design Decisions 3 to 5 — the splice, the volume match and the preview, with real
// ffmpeg on generated tones ("speech") and digital silence.

describe("matchGain", () => {
  it("is the difference of the two speech levels", () => {
    expect(matchGain({ rmsDb: -20.4, peakDb: -2 }, { rmsDb: -22.2, peakDb: -6.4 })).toBe(1.8);
  });

  it("is limited to ±6 dB", () => {
    expect(matchGain({ rmsDb: -10, peakDb: -2 }, { rmsDb: -30, peakDb: -20 })).toBe(MAX_TAKE_GAIN_DB);
    expect(matchGain({ rmsDb: -30, peakDb: -20 }, { rmsDb: -10, peakDb: -2 })).toBe(-MAX_TAKE_GAIN_DB);
  });

  it("never lifts the take's peak above -1 dBFS", () => {
    expect(matchGain({ rmsDb: -18, peakDb: -1 }, { rmsDb: -22, peakDb: -2.5 })).toBe(1.5);
  });

  it("keeps the wanted gain when the take's peak cannot be measured", () => {
    expect(matchGain({ rmsDb: -20, peakDb: -3 }, { rmsDb: -22, peakDb: Number.NEGATIVE_INFINITY })).toBe(2);
  });

  it("is 0 when either level is silence", () => {
    expect(matchGain({ rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY }, { rmsDb: -22, peakDb: -3 })).toBe(0);
  });
});

const haveFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0 && spawnSync(FFPROBE, ["-version"]).status === 0;
const work = mkdtempSync(join(tmpdir(), "vid4you-take-audio-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Mono 44.1 kHz audio: a 220 Hz tone of `amplitude` inside `spans`, digital silence elsewhere. */
function tone(name: string, seconds: number, amplitude: number, spans: Array<[number, number]>, codec: string[]): string {
  const inside = spans.map(([from, to]) => `between(t,${from},${to})`).join("+");
  const out = join(work, name);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc=exprs='if(${inside},${amplitude}*sin(2*PI*220*t),0)':s=44100:d=${seconds}`, "-ac", "1", ...codec, out]);
  return out;
}

function pcm(path: string, fromSample: number, toSample?: number): Buffer {
  const all = execFileSync(FFMPEG, ["-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-"], { maxBuffer: 256 * 1024 * 1024 });
  return all.subarray(fromSample * 2, toSample === undefined ? undefined : toSample * 2);
}

describe.skipIf(!haveFfmpeg)("the splice (real ffmpeg, generated audio)", () => {
  // Base: scene 1 speaks 0-0.7 s (interval 0-5), scene 2 5-5.7 s (5-10), scene 3 10-12 s (10-30).
  const base = tone("base.mp3", 30, 0.1, [[0, 0.7], [5, 5.7], [10, 12]], ["-c:a", "libmp3lame", "-b:a", "128k"]);
  // The take of scenes 1 and 2: quieter, scene 1 speaks 0.02-3.8 s, scene 2 4.4-9.0 s.
  const take = tone("take.mp3", 9.2, 0.08, [[0.02, 3.8], [4.4, 9.0]], ["-c:a", "libmp3lame", "-b:a", "128k"]);

  it("measures the speech level of each side, and the gain that matches them", async () => {
    const baseLevel = await measureSpeech(base, [{ start: 0, end: 0.7 }, { start: 5, end: 5.7 }]);
    const takeLevel = await measureSpeech(take, [{ start: 0.02, end: 3.8 }, { start: 4.4, end: 9.0 }]);
    // A sine of amplitude A has an RMS of A/√2: 0.1 → -23.0 dBFS, 0.08 → -24.9 dBFS.
    expect(baseLevel.rmsDb).toBeCloseTo(-23.0, 0);
    expect(takeLevel.rmsDb).toBeCloseTo(-24.9, 0);
    expect(matchGain(baseLevel, takeLevel)).toBeCloseTo(1.9, 0);
  });

  it("writes a FLAC with exactly the base's decoded sample count, identical to the base after the section", async () => {
    const takeSeconds = await probeDurationSeconds(take);
    const plan = planTakeFit({
      narrationDurationSeconds: 30,
      previousSpeechEndSeconds: null,
      takeDurationSeconds: takeSeconds,
      scenes: [
        { sceneId: "a", index: 1, startSeconds: 0, endSeconds: 5, basePauseSeconds: 4.3, takeSpeechStart: 0.02, takeSpeechEnd: 3.8 },
        { sceneId: "b", index: 2, startSeconds: 5, endSeconds: 10, basePauseSeconds: 4.3, takeSpeechStart: 4.4, takeSpeechEnd: 9.0 },
      ],
    });
    if (!plan.ok) throw new Error("the take should fit");
    const output = join(work, "narration-take-1.flac");

    const { totalSamples } = await spliceNarration({ basePath: base, takePath: take, plan, gainDb: 1.9, outputPath: output });

    const baseShape = await decodedShape(base);
    expect(totalSamples).toBe(baseShape.totalSamples);
    const resume = Math.round(plan.baseResumesAt * 44100);
    expect(pcm(output, resume).equals(pcm(base, resume))).toBe(true);
    // Scene 2's new speech starts at its interval's start: the second before it is silent, the one after it is not.
    const level = async (start: number, end: number) => (await measureSpeech(output, [{ start, end }])).rmsDb;
    expect(await level(4.6, 4.98)).toBe(Number.NEGATIVE_INFINITY);
    expect(await level(5.0, 5.5)).toBeGreaterThan(-30);
  });

  it("measures nothing for no spans, and refuses a file it cannot read", async () => {
    expect(await measureSpeech(base, [])).toEqual({ rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY });
    const broken = join(work, "broken.mp3");
    execFileSync("sh", ["-c", `printf 'not audio' > '${broken}'`]);
    await expect(probeDurationSeconds(broken)).rejects.toThrow();
    await expect(decodedShape(broken)).rejects.toThrow();
  });

  it("writes an AAC preview from 3 s before the section to 3 s after it, cut at the narration's start", async () => {
    const preview = join(work, "narration-take-1-preview.m4a");
    await writePreview(base, { start: 0, end: 10 }, 30, preview);
    expect(execFileSync(FFPROBE, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", preview], { encoding: "utf8" }).trim()).toBe("aac");
    expect(await probeDurationSeconds(preview)).toBeCloseTo(13, 0);
  });
});
