import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE } from "./config/ffmpeg.ts";
import { buildSpliceFilter, type TakeFitPlan } from "./narrationTakeFit.ts";
import { PEAK_LIMIT_DB } from "./voiceLevel.ts";

// redo-scene-narration (JOS-282), design Decisions 3 to 5 — the ffmpeg half of a take: measure, splice, preview. The
// spliced narration is FLAC (lossless); the mux encodes it once. Nothing here reads or writes the store.

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

/** Product owner default (design Decision 14): the most the volume match may change the take. */
export const MAX_TAKE_GAIN_DB = 6;
/** Product owner default (design Decision 14): narration heard before and after the section in the preview. */
export const PREVIEW_CONTEXT_SECONDS = 3;

export interface SpeechLevel {
  /** RMS level of the measured speech, in dBFS; -Infinity for silence. */
  rmsDb: number;
  peakDb: number;
}

export interface SpeechSpan {
  start: number;
  end: number;
}

/**
 * design Decision 5 — the one gain for the take: the difference of the two speech levels, at most ±6 dB, and lowered
 * so the take's peak stays at or under -1 dBFS. 0 when either level cannot be measured (silence).
 */
export function matchGain(base: SpeechLevel, take: SpeechLevel): number {
  if (!Number.isFinite(base.rmsDb) || !Number.isFinite(take.rmsDb)) return 0;
  const wanted = Math.max(-MAX_TAKE_GAIN_DB, Math.min(MAX_TAKE_GAIN_DB, base.rmsDb - take.rmsDb));
  const headroom = Number.isFinite(take.peakDb) ? PEAK_LIMIT_DB - take.peakDb : wanted;
  return Math.round(Math.min(wanted, headroom) * 100) / 100;
}

const parseDb = (value: string | undefined): number => (value === undefined || /inf/i.test(value) ? Number.NEGATIVE_INFINITY : Number(value));

/** The narration's sample rate, channels and exact decoded sample count (the splice must keep that count). */
export async function decodedShape(path: string): Promise<{ sampleRate: number; channels: number; totalSamples: number }> {
  const work = mkdtempSync(join(tmpdir(), "vid4you-take-probe-"));
  try {
    const wav = join(work, "decoded.wav");
    await run(FFMPEG, ["-v", "error", "-y", "-i", path, "-map", "0:a:0", "-c:a", "pcm_s16le", wav], { maxBuffer: MAX_BUFFER });
    const { stdout } = await run(FFPROBE, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,duration_ts", "-of", "csv=p=0", wav]);
    const [rate, channels, samples] = stdout.trim().split(",").map(Number);
    if (!rate || !channels || !samples) throw new Error("the narration's audio could not be measured");
    return { sampleRate: rate, channels, totalSamples: samples };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function probeDurationSeconds(path: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("the audio's duration could not be read");
  return seconds;
}

/** The RMS and peak level of the audio inside `spans`, joined. */
export async function measureSpeech(path: string, spans: readonly SpeechSpan[]): Promise<SpeechLevel> {
  const usable = spans.filter((span) => span.end > span.start);
  if (usable.length === 0) return { rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY };
  const trims = usable.map((span, i) => `[0:a]atrim=start=${span.start.toFixed(6)}:end=${span.end.toFixed(6)},asetpts=N/SR/TB[m${i}]`);
  const graph = `${trims.join(";")};${usable.map((_, i) => `[m${i}]`).join("")}concat=n=${usable.length}:v=0:a=1,astats=measure_perchannel=none[out]`;
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-nostats", "-i", path, "-filter_complex", graph, "-map", "[out]", "-f", "null", "-"], { maxBuffer: MAX_BUFFER });
  const rms = [...stderr.matchAll(/RMS level dB:\s*(\S+)/g)].at(-1)?.[1];
  const peak = [...stderr.matchAll(/Peak level dB:\s*(\S+)/g)].at(-1)?.[1];
  return { rmsDb: parseDb(rms), peakDb: parseDb(peak) };
}

export interface SpliceRequest {
  basePath: string;
  takePath: string;
  plan: Extract<TakeFitPlan, { ok: true }>;
  gainDb: number;
  /** The FLAC to write. */
  outputPath: string;
}

/**
 * Writes the spliced narration and checks it has exactly the base's decoded sample count. 16-bit FLAC: the default 24-bit
 * would round the untouched base differently from a direct decode, so it would not stay sample-for-sample the same.
 */
export async function spliceNarration(request: SpliceRequest): Promise<{ totalSamples: number }> {
  const shape = await decodedShape(request.basePath);
  const { filter } = buildSpliceFilter(request.plan, { sampleRate: shape.sampleRate, baseTotalSamples: shape.totalSamples, gainDb: request.gainDb });
  await run(
    FFMPEG,
    ["-v", "error", "-y", "-i", request.basePath, "-i", request.takePath, "-filter_complex", filter, "-map", "[out]", "-ac", String(shape.channels), "-c:a", "flac", "-sample_fmt", "s16", request.outputPath],
    { maxBuffer: MAX_BUFFER },
  );
  const written = await decodedShape(request.outputPath);
  if (written.totalSamples !== shape.totalSamples) {
    throw new Error(`the new narration has ${written.totalSamples} samples instead of ${shape.totalSamples}`);
  }
  return { totalSamples: written.totalSamples };
}

/** The review copy: the narration from 3 s before the section to 3 s after it, cut at its ends, AAC in an MP4 container. */
export async function writePreview(narrationPath: string, section: SpeechSpan, durationSeconds: number, outputPath: string): Promise<void> {
  const from = Math.max(0, section.start - PREVIEW_CONTEXT_SECONDS);
  const to = Math.min(durationSeconds, section.end + PREVIEW_CONTEXT_SECONDS);
  await run(
    FFMPEG,
    ["-v", "error", "-y", "-i", narrationPath, "-ss", from.toFixed(6), "-to", to.toFixed(6), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4", outputPath],
    { maxBuffer: MAX_BUFFER },
  );
}
