import type { TimestampCharacter } from "./narrationTimestamps.ts";
import { PAUSE_CAP_SECONDS, PAUSE_FLOOR_SECONDS } from "./scenePause.ts";

// redo-scene-narration (JOS-282), design Decision 3 — where each selected scene's new reading goes in the narration,
// planned from character timestamps only. Pure: no I/O. A scene's speech starts exactly at its stored interval's start
// (D11); the pause after it absorbs the difference, and the speed changes only when the pause cannot.

/** Product owner default (design Decision 14, from the 2026-11-26 manual fix, which used 2%): the largest speed change. */
export const MAX_TAKE_SPEED_CHANGE = 0.05;
/** Product owner default (design Decision 14): how far before a speech onset a cut is made, at most. */
export const TAKE_CUT_LEAD_SECONDS = 0.05;

const EPSILON = 1e-9;

/** One selected scene, with its stored interval and where its speech is in the base narration and in the take. */
export interface TakeFitScene {
  sceneId: string;
  index: number;
  /** The stored narration interval (locked). */
  startSeconds: number;
  endSeconds: number;
  /** The scene's pause in the narration the take is built on: the dial's cap is the larger of 3.0 s and this. */
  basePauseSeconds: number;
  /** The take's first and last spoken character of this scene, in take time. */
  takeSpeechStart: number;
  takeSpeechEnd: number;
}

export interface TakeFitInput {
  /** The base narration's measured duration (the last scene's interval ends here). */
  narrationDurationSeconds: number;
  /** Where the base narration's speech before the section ends; null when the section starts the session. */
  previousSpeechEndSeconds: number | null;
  takeDurationSeconds: number;
  /** Consecutive scenes in ascending order. */
  scenes: readonly TakeFitScene[];
}

/** One scene's part of the take, and where it goes. Take times select the audio; output times place it. */
export interface TakeFitPart {
  sceneId: string;
  /** Applied to the take from `takeSpeechStart` on; the lead before it keeps its speed, so the speech starts exactly on time. */
  tempo: number;
  takeFrom: number;
  takeSpeechStart: number;
  /** The middle of the take's own pause after this scene (the take's end for the last part). */
  takeTo: number;
  outputFrom: number;
  /** The interval's start, where the first spoken character lands. */
  outputSpeechStart: number;
  outputTo: number;
  /** The resulting pause after this scene's speech: interval end minus speech end. */
  pauseSeconds: number;
}

export type TakeFitPlan =
  | {
      ok: true;
      parts: TakeFitPart[];
      /** The base narration is kept before this instant and from `baseResumesAt` on; the parts fill the rest exactly. */
      baseKeptUntil: number;
      baseResumesAt: number;
    }
  | { ok: false; sceneIndex: number; problem: "too-long" | "too-short"; bySeconds: number };

/** The speed that fits `speech` into `interval` with a pause between `floor` and `cap`, or why none within the limit does. */
function fitSpeed(speech: number, interval: number, cap: number): { tempo: number } | { problem: "too-long" | "too-short"; bySeconds: number } {
  const natural = interval - speech;
  if (natural >= PAUSE_FLOOR_SECONDS - EPSILON && natural <= cap + EPSILON) return { tempo: 1 };
  if (natural < PAUSE_FLOOR_SECONDS) {
    const room = interval - PAUSE_FLOOR_SECONDS;
    const tempo = room > 0 ? speech / room : Number.POSITIVE_INFINITY;
    return tempo <= 1 + MAX_TAKE_SPEED_CHANGE + EPSILON ? { tempo } : { problem: "too-long", bySeconds: PAUSE_FLOOR_SECONDS - natural };
  }
  const tempo = speech / (interval - cap);
  return tempo >= 1 - MAX_TAKE_SPEED_CHANGE - EPSILON ? { tempo } : { problem: "too-short", bySeconds: natural - cap };
}

export function planTakeFit(input: TakeFitInput): TakeFitPlan {
  const { scenes, narrationDurationSeconds, previousSpeechEndSeconds, takeDurationSeconds } = input;
  const first = scenes[0]!;
  const last = scenes.at(-1)!;

  // The lead before each part's speech: never more than the take's own silence there, nor half the silence on the base
  // side of a join, so a cut is always made in silence. The session's very first scene starts at 0: no lead.
  const leads = scenes.map((scene, position) => {
    if (position === 0) {
      const baseSilence = previousSpeechEndSeconds === null ? scene.startSeconds : (scene.startSeconds - previousSpeechEndSeconds) / 2;
      return Math.max(0, Math.min(TAKE_CUT_LEAD_SECONDS, scene.takeSpeechStart, baseSilence));
    }
    return Math.max(0, Math.min(TAKE_CUT_LEAD_SECONDS, (scene.takeSpeechStart - scenes[position - 1]!.takeSpeechEnd) / 2));
  });
  // Where the base narration resumes: just before the next scene's speech, or at the narration's end.
  const resumeLead =
    last.endSeconds >= narrationDurationSeconds - EPSILON ? 0 : Math.max(0, Math.min(TAKE_CUT_LEAD_SECONDS, last.basePauseSeconds / 2));
  const baseResumesAt = last.endSeconds - resumeLead;

  const parts: TakeFitPart[] = [];
  for (const [position, scene] of scenes.entries()) {
    const speech = scene.takeSpeechEnd - scene.takeSpeechStart;
    const interval = scene.endSeconds - scene.startSeconds;
    const speed = fitSpeed(speech, interval, Math.max(PAUSE_CAP_SECONDS, scene.basePauseSeconds));
    if (!("tempo" in speed)) return { ok: false, sceneIndex: scene.index, ...speed };

    const next = scenes[position + 1];
    parts.push({
      sceneId: scene.sceneId,
      tempo: speed.tempo,
      takeFrom: scene.takeSpeechStart - leads[position]!,
      takeSpeechStart: scene.takeSpeechStart,
      takeTo: next ? (scene.takeSpeechEnd + next.takeSpeechStart) / 2 : takeDurationSeconds,
      outputFrom: scene.startSeconds - leads[position]!,
      outputSpeechStart: scene.startSeconds,
      outputTo: next ? next.startSeconds - leads[position + 1]! : baseResumesAt,
      pauseSeconds: interval - speech / speed.tempo,
    });
  }
  return { ok: true, parts, baseKeptUntil: first.startSeconds - leads[0]!, baseResumesAt };
}

// ---- The filtergraph (design Decision 3) ----

/** Product owner default (design Decision 14): the fade on the take's side of each join, always made in silence. */
export const TAKE_JOIN_FADE_SECONDS = 0.01;

type FittingPlan = Extract<TakeFitPlan, { ok: true }>;

const fixed = (value: number): string => value.toFixed(6);

export interface SpliceAudio {
  sampleRate: number;
  /** The decoded base narration's sample count: the result has exactly as many. */
  baseTotalSamples: number;
  /** The volume match, applied to the whole take (design Decision 5). */
  gainDb: number;
}

/**
 * One ffmpeg filtergraph: input 0 is the base narration, input 1 the take; ends at `[out]`. Every segment is forced to
 * its exact sample count (`apad` + `atrim`), so the result has exactly `baseTotalSamples` samples. Each part is the
 * take's lead at its own speed, then the rest at the part's tempo; its length is set at its end, which is the middle of
 * the take's own pause, so the pause changes there and never touches speech.
 */
export function buildSpliceFilter(plan: FittingPlan, audio: SpliceAudio): { filter: string; segmentSamples: number[] } {
  const { sampleRate, baseTotalSamples, gainDb } = audio;
  const sample = (seconds: number): number => Math.round(seconds * sampleRate);
  const fadeSamples = sample(TAKE_JOIN_FADE_SECONDS);
  const nodes: string[] = [];
  const labels: string[] = [];
  const segmentSamples: number[] = [];

  const keptUntil = sample(plan.baseKeptUntil);
  const resumesAt = sample(plan.baseResumesAt);
  const baseSegments = (keptUntil > 0 ? 1 : 0) + (resumesAt < baseTotalSamples ? 1 : 0);
  if (baseSegments > 0) nodes.push(`[0:a]asplit=${baseSegments}${Array.from({ length: baseSegments }, (_, i) => `[b${i}]`).join("")}`);
  nodes.push(`[1:a]aresample=${sampleRate},volume=${gainDb}dB,asplit=${plan.parts.length * 2}${plan.parts.map((_, i) => `[l${i}][s${i}]`).join("")}`);

  let baseLabel = 0;
  if (keptUntil > 0) {
    // The base is never faded: it is silent at every join, and outside the section it stays sample-for-sample unchanged.
    nodes.push(`[b${baseLabel++}]atrim=end_sample=${keptUntil},asetpts=N/SR/TB[pre]`);
    labels.push("[pre]");
    segmentSamples.push(keptUntil);
  }
  for (const [i, part] of plan.parts.entries()) {
    const length = sample(part.outputTo) - sample(part.outputFrom);
    const tempo = part.tempo === 1 ? "" : `,atempo=${fixed(part.tempo)}`;
    const fadeIn = sample(part.takeSpeechStart - part.takeFrom) >= fadeSamples ? `,afade=t=in:st=0:d=${fixed(TAKE_JOIN_FADE_SECONDS)}` : "";
    nodes.push(`[l${i}]atrim=start_sample=${sample(part.takeFrom)}:end_sample=${sample(part.takeSpeechStart)},asetpts=N/SR/TB[lead${i}]`);
    nodes.push(`[s${i}]atrim=start_sample=${sample(part.takeSpeechStart)}:end_sample=${sample(part.takeTo)},asetpts=N/SR/TB${tempo}[body${i}]`);
    nodes.push(
      `[lead${i}][body${i}]concat=n=2:v=0:a=1,apad,atrim=end_sample=${length},asetpts=N/SR/TB${fadeIn},afade=t=out:st=${fixed((length - fadeSamples) / sampleRate)}:d=${fixed(TAKE_JOIN_FADE_SECONDS)}[part${i}]`,
    );
    labels.push(`[part${i}]`);
    segmentSamples.push(length);
  }
  if (resumesAt < baseTotalSamples) {
    nodes.push(`[b${baseLabel}]atrim=start_sample=${resumesAt},asetpts=N/SR/TB[post]`);
    labels.push("[post]");
    segmentSamples.push(baseTotalSamples - resumesAt);
  }
  return { filter: `${nodes.join(";")};${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`, segmentSamples };
}

// ---- The new narration's timestamps (design Decision 3, spec "The new narration has timestamps that match the script") ----

const isWhitespace = (character: string): boolean => /\s/u.test(character);

/** Where take time `seconds` lands in the narration, by the part whose audio holds it. */
function placeTakeTime(seconds: number, part: TakeFitPart): number {
  const offset = seconds - part.takeSpeechStart;
  const placed = part.outputSpeechStart + (offset < 0 ? offset : offset / part.tempo);
  return Math.min(part.outputTo, Math.max(part.outputFrom, placed));
}

function partOf(plan: FittingPlan, seconds: number): TakeFitPart {
  let found = plan.parts[0]!;
  for (const part of plan.parts) if (part.takeFrom <= seconds) found = part;
  return found;
}

/** The base characters that spell `text` (whitespace ignored, which covers both timestamp mechanisms): [from, to). */
function baseSpan(script: string, textStart: number, textEnd: number, base: readonly TimestampCharacter[]): { from: number; to: number } {
  const countSolid = (text: string): number => [...text].filter((character) => !isWhitespace(character)).length;
  const solidBefore = countSolid(script.slice(0, textStart));
  const solidInText = countSolid(script.slice(textStart, textEnd));
  let solid = 0;
  let from = -1;
  for (const [index, character] of base.entries()) {
    if (character.text.length === 0 || [...character.text].every(isWhitespace)) continue;
    if (solid === solidBefore) from = index;
    solid += countSolid(character.text);
    if (from >= 0 && solid === solidBefore + solidInText) return { from, to: index + 1 };
  }
  throw new Error("the text to replace cannot be found in the narration's timestamps");
}

export interface SpliceTimestampsInput {
  script: string;
  /** The quoted text is `script.slice(textStart, textEnd)`. */
  textStart: number;
  textEnd: number;
  /** The base narration's characters (they reproduce the script, exactly or ignoring whitespace). */
  base: readonly TimestampCharacter[];
  /** The take's characters: exactly the quoted text, in take time. */
  take: readonly TimestampCharacter[];
  plan: FittingPlan;
}

/**
 * The whole resulting narration's characters: the base's before and after the text unchanged, the take's moved by the
 * same placement and speed as its audio. A base character outside the text whose time falls inside the replaced
 * section (whitespace around the text) is moved next to the take's speech, so times never go backwards.
 */
export function spliceTimestamps(input: SpliceTimestampsInput): TimestampCharacter[] {
  const { script, textStart, textEnd, base, take, plan } = input;
  const { from, to } = baseSpan(script, textStart, textEnd, base);

  const before = base.slice(0, from).map((character) =>
    character.start >= plan.baseKeptUntil ? { ...character, start: plan.baseKeptUntil, end: plan.baseKeptUntil } : character,
  );
  const placed = take.map((character) => {
    const part = partOf(plan, character.start);
    return { text: character.text, start: placeTakeTime(character.start, part), end: placeTakeTime(character.end, part) };
  });
  const speechEnd = placed.reduce((latest, character) => Math.max(latest, character.end), plan.baseKeptUntil);
  const after = base.slice(to).map((character) =>
    character.start < plan.baseResumesAt ? { ...character, start: Math.max(character.start, speechEnd), end: Math.max(character.end, speechEnd) } : character,
  );
  return [...before, ...placed, ...after];
}
