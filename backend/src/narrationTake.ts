import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activeProviderId } from "./activeProvider.ts";
import { phaseTimeoutMs } from "./config/providers.ts";
import * as concurrency from "./concurrency.ts";
import {
  currentNarration,
  decideNarrationTake,
  failNarrationTake,
  getNarrationTake,
  getNarrationTakes,
  hasOpenNarrationTake,
  getRun,
  getScenePauseEdits,
  getScenesForRun,
  getStageAttempts,
  inTransaction,
  insertNarrationTake,
  markNarrationTakeReady,
  markNarrationTakeSent,
  recordNarrationTakeProviderOutcome,
  resolveArtefactPath,
  writeArtefactOnce,
  db,
} from "./db.ts";
import { providerPricing } from "./estimatedCostReport.ts";
import { matchGain, measureSpeech, probeDurationSeconds, spliceNarration, writePreview } from "./narrationTakeAudio.ts";
import { planTakeFit, spliceTimestamps, type TakeFitScene } from "./narrationTakeFit.ts";
import { checkTimestamps, parseNativeTimestamps, type TimestampCharacter } from "./narrationTimestamps.ts";
import { broadcast } from "./orchestrator.ts";
import { locateFragment, PAUSE_CAP_SECONDS } from "./scenePause.ts";
import { sentenceSpeechSpans, type SpeechSpan } from "./sentenceTimings.ts";
import { readStoredCharacters } from "./sessionPauses.ts";
import type { CurrentNarration, NarrationTake, NarrationTakeProviderOutcome, NarrationView, Run, Scene } from "./types.ts";
import { getVoiceProviderRegistry, type VoiceSynthesisResult } from "./voiceProvider.ts";
import { voiceParametersFor } from "./voiceOverPhase.ts";

// redo-scene-narration (JOS-282) — the User reads consecutive scenes' narration again, once, from the session's voice
// provider; the new reading is fitted into those scenes' locked intervals, reviewed, and kept or discarded. A take is
// its own record, not a pipeline stage (design Decision 1): never retried, never part of the session's state.

/** Product owner default (design Decision 14): the most text one take may read again. */
export const MAX_TAKE_CHARACTERS = 2500;
/** Product owner default (design Decision 14): the script sent on each side as context, so the tone matches. */
export const TAKE_CONTEXT_CHARACTERS = 1000;

export type TakeSelectionRefusal = "unknown-scene" | "invalid-range" | "too-long" | "narration-not-located";
export type TakeCreateRefusal = TakeSelectionRefusal | "take-in-progress" | "assembly-in-progress";
export type TakeDecisionRefusal = "unknown-take" | "take-not-open" | "take-not-ready" | "assembly-in-progress";

interface TakeLogger {
  info: (fields: Record<string, unknown>, message?: string) => void;
  warn: (fields: Record<string, unknown>, message?: string) => void;
}
let logger: TakeLogger = { info: () => {}, warn: () => {} };
export function setNarrationTakeLogger(next: TakeLogger): void {
  logger = next;
}

/** The ffmpeg half (design Decisions 3 to 5); tests replace it. */
export interface NarrationTakeAudioTools {
  probeDurationSeconds: typeof probeDurationSeconds;
  measureSpeech: typeof measureSpeech;
  spliceNarration: typeof spliceNarration;
  writePreview: typeof writePreview;
}
const ffmpegTools: NarrationTakeAudioTools = { probeDurationSeconds, measureSpeech, spliceNarration, writePreview };
let audioTools: NarrationTakeAudioTools = ffmpegTools;
export function setNarrationTakeAudioTools(next: NarrationTakeAudioTools): void {
  audioTools = next;
}
export function resetNarrationTakeAudioTools(): void {
  audioTools = ffmpegTools;
}

// ---- Locating the scenes' narration in the current timestamps ----

interface LocatedScene {
  scene: Scene;
  /** UTF-16 offsets of the scene's PROMPT in the script. */
  textStart: number;
  textEnd: number;
  /** Its speech in the current narration. */
  speech: SpeechSpan;
}

interface SessionNarration {
  run: Run;
  narration: CurrentNarration;
  characters: TimestampCharacter[];
  scenes: Scene[];
  /** Every scene whose narration can be redone, by id. */
  located: Map<string, LocatedScene>;
}

function loadSessionNarration(runId: string): SessionNarration | null {
  const run = getRun(runId);
  const narration = currentNarration(runId);
  if (!run || !narration?.timestampsPath) return null;
  const characters = readStoredCharacters(run.projectFolder, narration.timestampsPath);
  if (!characters) return null;
  const scenes = getScenesForRun(runId).sort((a, b) => a.index - b.index);

  const candidates: Array<{ scene: Scene; start: number; end: number }> = [];
  let cursor = 0;
  for (const scene of scenes) {
    if (!scene.narrationInterval || !scene.prompt) continue;
    const span = locateFragment(run.script, scene.prompt, cursor);
    if (!span) continue;
    candidates.push({ scene, ...span });
    cursor = span.end;
  }
  const located = new Map<string, LocatedScene>();
  try {
    const spans = sentenceSpeechSpans(
      run.script,
      candidates.map((candidate) => ({ text: run.script.slice(candidate.start, candidate.end), start: candidate.start, end: candidate.end })),
      characters,
    );
    candidates.forEach((candidate, position) =>
      located.set(candidate.scene.id, { scene: candidate.scene, textStart: candidate.start, textEnd: candidate.end, speech: spans[position]! }),
    );
  } catch {
    // characters that do not match the script: no scene can be redone.
  }
  return { run, narration, characters, scenes, located };
}

/** design Decision 10 — the scenes whose narration can be redone (their PROMPT is located in the current timestamps). */
export function redoableSceneIds(runId: string): Set<string> {
  return new Set(loadSessionNarration(runId)?.located.keys() ?? []);
}

/** design Decision 10 — what the session read shows: the version, the open take, and each scene's two flags. */
export function narrationReadModel(runId: string): { narration?: NarrationView; redone: Set<string>; redoable: Set<string> } {
  const narration = currentNarration(runId);
  if (!narration) return { redone: new Set(), redoable: new Set() };
  const scenes = getScenesForRun(runId);
  const indexOf = new Map(scenes.map((scene) => [scene.id, scene.index]));
  const takes = getNarrationTakes(runId);
  const redone = new Set<string>();
  for (const take of takes.filter((candidate) => candidate.state === "kept")) {
    const first = indexOf.get(take.firstSceneId)!;
    const last = indexOf.get(take.lastSceneId)!;
    for (const scene of scenes) if (scene.index >= first && scene.index <= last) redone.add(scene.id);
  }
  const latest = takes.at(-1);
  const open = latest && (latest.state === "generating" || latest.state === "ready" || latest.state === "failed") ? latest : undefined;
  const view: NarrationView = { version: narration.version, audioUrl: `/sessions/${runId}/narration/audio?v=${narration.version}` };
  if (open) {
    view.take = {
      takeId: open.id,
      state: open.state as "generating" | "ready" | "failed",
      firstSceneIndex: indexOf.get(open.firstSceneId)!,
      lastSceneIndex: indexOf.get(open.lastSceneId)!,
      ...(open.state === "ready" ? { previewUrl: `/sessions/${runId}/narration-takes/${open.id}/preview` } : {}),
      ...(open.state === "failed" && open.failure ? { failure: open.failure } : {}),
    };
  }
  return { narration: view, redone, redoable: redoableSceneIds(runId) };
}

interface Selection extends SessionNarration {
  selected: LocatedScene[];
  text: string;
  textStart: number;
  textEnd: number;
}

function selectScenes(sessionId: string, firstSceneId: string, lastSceneId: string): { ok: true; selection: Selection } | { ok: false; reason: TakeSelectionRefusal } {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "unknown-scene" };
  const scenes = getScenesForRun(sessionId);
  const first = scenes.find((scene) => scene.id === firstSceneId);
  const last = scenes.find((scene) => scene.id === lastSceneId);
  if (!first || !last) return { ok: false, reason: "unknown-scene" };
  if (last.index < first.index) return { ok: false, reason: "invalid-range" };

  const session = loadSessionNarration(sessionId);
  if (!session) return { ok: false, reason: "narration-not-located" };
  const selected: LocatedScene[] = [];
  for (const scene of session.scenes.filter((candidate) => candidate.index >= first.index && candidate.index <= last.index)) {
    const located = session.located.get(scene.id);
    if (!located) return { ok: false, reason: "narration-not-located" };
    selected.push(located);
  }
  const textStart = selected[0]!.textStart;
  const textEnd = selected.at(-1)!.textEnd;
  const text = run.script.slice(textStart, textEnd);
  if (text.length > MAX_TAKE_CHARACTERS) return { ok: false, reason: "too-long" };
  return { ok: true, selection: { ...session, selected, text, textStart, textEnd } };
}

const providerOf = (run: Run): string => run.voiceProviderId ?? activeProviderId("voice");

// ---- The quote (spec: "The User can get a quote") ----

export interface TakeQuote {
  text: string;
  characters: number;
  estimatedCost: { amount: number; currency: string } | null;
  /** The selected scenes' indexes whose pause edits a kept take would remove. */
  pauseEditsReset: number[];
}

export function quoteNarrationTake(sessionId: string, firstSceneId: string, lastSceneId: string): { ok: true; quote: TakeQuote } | { ok: false; reason: TakeSelectionRefusal } {
  const selected = selectScenes(sessionId, firstSceneId, lastSceneId);
  if (!selected.ok) return selected;
  const { selection } = selected;
  const price = providerPricing().get(providerOf(selection.run))?.price ?? null;
  const edits = getScenePauseEdits(sessionId);
  return {
    ok: true,
    quote: {
      text: selection.text,
      characters: selection.text.length,
      estimatedCost: price ? { amount: selection.text.length * price.pricePerUnit, currency: price.currency } : null,
      pauseEditsReset: selection.selected.filter((entry) => edits.has(entry.scene.id)).map((entry) => entry.scene.index),
    },
  };
}

// ---- Creating a take (spec: "A confirmed take sends the selected text once") ----

const assemblyInProgress = (run: Run): boolean =>
  run.rebuildRequestedAt !== null || getStageAttempts(run.id, "assembly").some((attempt) => attempt.outcome === "in-flight");


/** The context on one side: at most 1,000 characters, cut at a whitespace so no word is split. */
export function contextBefore(script: string, at: number): string {
  const from = Math.max(0, at - TAKE_CONTEXT_CHARACTERS);
  const slice = script.slice(from, at);
  if (from === 0) return slice;
  const cut = slice.search(/\s/u);
  return cut < 0 ? "" : slice.slice(cut);
}
export function contextAfter(script: string, at: number): string {
  const to = Math.min(script.length, at + TAKE_CONTEXT_CHARACTERS);
  const slice = script.slice(at, to);
  if (to === script.length) return slice;
  const cut = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  return cut < 0 ? "" : slice.slice(0, cut + 1);
}

/** Records the take, answers at once, and sends it in the background. No `await` before the insert decides. */
export function createNarrationTake(sessionId: string, firstSceneId: string, lastSceneId: string, now: () => Date = () => new Date()): { ok: true; takeId: string } | { ok: false; reason: TakeCreateRefusal } {
  const selected = selectScenes(sessionId, firstSceneId, lastSceneId);
  if (!selected.ok) return selected;
  const { selection } = selected;
  if (hasOpenNarrationTake(sessionId)) return { ok: false, reason: "take-in-progress" };
  if (assemblyInProgress(selection.run)) return { ok: false, reason: "assembly-in-progress" };
  const take = insertNarrationTake({
    runId: sessionId,
    firstSceneId,
    lastSceneId,
    textLength: selection.text.length,
    providerId: providerOf(selection.run),
    baseVersion: selection.narration.version,
    requestedAt: now().toISOString(),
  });
  if (!take) return { ok: false, reason: "take-in-progress" };
  logger.info({ event: "narration-take.requested", sessionId, takeId: take.id, takeNumber: take.number, provider: take.providerId, textLength: take.textLength });
  broadcast(sessionId);
  concurrency.acquire("voice", take.id, () => {
    void sendTake(take, selection, now).finally(() => broadcast(sessionId));
  });
  return { ok: true, takeId: take.id };
}

type TimedResult = { timedOut: true } | { timedOut: false; result: VoiceSynthesisResult };

/** The provider call, limited by the voice phase's time limit; the slot is released when the call itself returns. */
async function callProvider(take: NarrationTake, selection: Selection): Promise<TimedResult> {
  const release = (): void => concurrency.release("voice", take.id);
  const adapter = getVoiceProviderRegistry().adapters[take.providerId];
  if (!adapter) {
    release();
    return { timedOut: false, result: { kind: "failed_not_retryable", reason: `the voice provider '${take.providerId}' bound to this session is not available` } };
  }
  const voice = voiceParametersFor(take.providerId);
  const call = adapter
    .synthesize({
      text: selection.text,
      language: selection.run.language,
      voiceId: voice.voiceId,
      model: voice.model,
      outputFormat: voice.outputFormat,
      speed: voice.speed,
      previousText: contextBefore(selection.run.script, selection.textStart),
      nextText: contextAfter(selection.run.script, selection.textEnd),
    })
    .catch((): VoiceSynthesisResult => ({ kind: "failed_transient", reason: "the voice provider call failed unexpectedly" }))
    .finally(release);
  const limitMs = phaseTimeoutMs("voice");
  if (limitMs === undefined) return { timedOut: false, result: await call };
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<TimedResult>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), limitMs);
  });
  try {
    // A late answer resolves `call` after the race is decided, and nothing reads it: it is dropped.
    return await Promise.race([call.then((result): TimedResult => ({ timedOut: false, result })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const OUTCOME_OF: Record<Exclude<VoiceSynthesisResult["kind"], "success">, NarrationTakeProviderOutcome> = {
  failed_transient: "transient",
  failed_not_retryable: "not-retryable",
};

/** A sentence for the User from a provider reason; the adapters' reasons never contain credentials. */
const capitalised = (reason: string): string => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${reason.endsWith(".") ? "" : "."}`;

async function sendTake(take: NarrationTake, selection: Selection, now: () => Date): Promise<void> {
  const startedAt = now();
  markNarrationTakeSent(take.id, startedAt.toISOString());
  const log = (outcome: string, extra: Record<string, unknown> = {}): void =>
    logger.info({ event: "narration-take.finished", sessionId: take.runId, takeId: take.id, takeNumber: take.number, provider: take.providerId, textLength: take.textLength, outcome, latencyMs: now().getTime() - startedAt.getTime(), ...extra });
  const fail = (cause: string, outcome: string): void => {
    failNarrationTake(take.id, cause, now().toISOString());
    log(outcome);
  };

  const answer = await callProvider(take, selection);
  if (answer.timedOut) {
    recordNarrationTakeProviderOutcome(take.id, "timed-out", now().toISOString());
    fail(`The voice provider did not answer within the ${Math.round((phaseTimeoutMs("voice") ?? 0) / 1000)} s time limit. Try again.`, "timed-out");
    return;
  }
  const { result } = answer;
  if (result.kind !== "success") {
    recordNarrationTakeProviderOutcome(take.id, OUTCOME_OF[result.kind], now().toISOString());
    fail(capitalised(result.reason), OUTCOME_OF[result.kind]);
    return;
  }
  recordNarrationTakeProviderOutcome(take.id, "success", now().toISOString(), result.providerRequestId);

  try {
    const built = await buildTake(take, selection, result);
    if (!built.ok) {
      fail(built.cause, built.outcome);
      return;
    }
    if (markNarrationTakeReady(take.id, built.files, now().toISOString())) log("ready");
  } catch (err) {
    fail("The new narration could not be built from the new reading. Try again.", "build-failed");
    logger.warn({ event: "narration-take.build-error", sessionId: take.runId, takeId: take.id, reason: err instanceof Error ? err.name : "unknown" });
  }
}

type BuildOutcome =
  | { ok: true; files: { takeAudioPath: string; takeTimestampsPath: string; narrationPath: string; narrationTimestampsPath: string; previewPath: string } }
  | { ok: false; cause: string; outcome: string };

/** Checks the reading's timestamps, fits it, splices it, and writes the take's five files (design Decisions 3 to 5, 8). */
async function buildTake(take: NarrationTake, selection: Selection, result: Extract<VoiceSynthesisResult, { kind: "success" }>): Promise<BuildOutcome> {
  const { run, narration, characters: base, selected, text, textStart, textEnd } = selection;
  const name = `narration-take-${take.number}`;
  if (result.nativeTimestamps === undefined) {
    return { ok: false, cause: "The voice provider gives no character timestamps, which a redo needs.", outcome: "not-usable" };
  }
  const takeAudioPath = writeArtefactOnce(run.projectFolder, `${name}.mp3`, Buffer.from(result.audio));
  const takeTimestampsPath = writeArtefactOnce(run.projectFolder, `${name}-provider-timestamps.json`, JSON.stringify(result.nativeTimestamps));
  const takeAudio = resolveArtefactPath(run.projectFolder, takeAudioPath);
  const takeSeconds = await audioTools.probeDurationSeconds(takeAudio);

  const parsed = parseNativeTimestamps(result.nativeTimestamps);
  const usable = parsed.ok ? checkTimestamps(parsed.characters, text, takeSeconds, "exact") : { usable: false as const, reason: parsed.reason };
  if (!parsed.ok || !usable.usable) return { ok: false, cause: "The new reading's timestamps do not match the text, so it cannot be fitted. Try again.", outcome: "not-usable" };
  const takeCharacters = parsed.characters;

  // Each selected scene's speech in the take, from its PROMPT's place in the text.
  const takeSpeech = sentenceSpeechSpans(
    text,
    selected.map((entry) => ({ text: text.slice(entry.textStart - textStart, entry.textEnd - textStart), start: entry.textStart - textStart, end: entry.textEnd - textStart })),
    takeCharacters,
  );
  const scenes: TakeFitScene[] = selected.map((entry, position) => ({
    sceneId: entry.scene.id,
    index: entry.scene.index,
    startSeconds: entry.scene.narrationInterval!.startSeconds,
    endSeconds: entry.scene.narrationInterval!.endSeconds,
    basePauseSeconds: entry.scene.narrationInterval!.endSeconds - entry.speech.end,
    takeSpeechStart: takeSpeech[position]!.start,
    takeSpeechEnd: takeSpeech[position]!.end,
  }));
  const spokenBefore = [...run.script.slice(0, textStart)].filter((character) => !/\s/u.test(character)).length;
  const spokenBase = base.filter((character) => !/\s/u.test(character.text));
  const plan = planTakeFit({
    narrationDurationSeconds: narration.durationSeconds,
    previousSpeechEndSeconds: spokenBefore > 0 ? (spokenBase[spokenBefore - 1]?.end ?? null) : null,
    takeDurationSeconds: takeSeconds,
    scenes,
  });
  if (!plan.ok) {
    const cap = Math.max(PAUSE_CAP_SECONDS, scenes.find((scene) => scene.index === plan.sceneIndex)!.basePauseSeconds);
    const cause =
      plan.problem === "too-long"
        ? `Scene ${plan.sceneIndex}'s new reading is too long by ${plan.bySeconds.toFixed(1)} s at its normal speed.`
        : `Scene ${plan.sceneIndex}'s new reading is too short by ${plan.bySeconds.toFixed(1)} s at its normal speed: even 5% slower, its pause would be longer than ${cap.toFixed(1)} s.`;
    return { ok: false, cause, outcome: "not-fitted" };
  }

  const baseAudio = resolveArtefactPath(run.projectFolder, narration.audioPath);
  const gainDb = matchGain(
    await audioTools.measureSpeech(baseAudio, selected.map((entry) => entry.speech)),
    await audioTools.measureSpeech(takeAudio, takeSpeech),
  );
  const spliced = spliceTimestamps({ script: run.script, textStart, textEnd, base, take: takeCharacters, plan });
  const mechanism = narration.mechanism ?? "native";
  const check = checkTimestamps(spliced, run.script, narration.durationSeconds, mechanism === "native" ? "exact" : "ignore-whitespace");
  if (!check.usable) return { ok: false, cause: "The new narration's timestamps do not match the script, so it cannot be used. Try again.", outcome: "not-usable" };

  const work = mkdtempSync(join(tmpdir(), "vid4you-take-"));
  try {
    const flac = join(work, "narration.flac");
    await audioTools.spliceNarration({ basePath: baseAudio, takePath: takeAudio, plan, gainDb, outputPath: flac });
    const narrationPath = writeArtefactOnce(run.projectFolder, `${name}.flac`, readFileSync(flac));
    const narrationTimestampsPath = writeArtefactOnce(run.projectFolder, `${name}-timestamps.json`, JSON.stringify({ mechanism, characters: spliced }));
    const preview = join(work, "preview.m4a");
    await audioTools.writePreview(flac, { start: plan.baseKeptUntil, end: plan.baseResumesAt }, narration.durationSeconds, preview);
    const previewPath = writeArtefactOnce(run.projectFolder, `${name}-preview.m4a`, readFileSync(preview));
    return { ok: true, files: { takeAudioPath, takeTimestampsPath, narrationPath, narrationTimestampsPath, previewPath } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---- Keep and discard (design Decision 7) ----

export function keepNarrationTake(sessionId: string, takeId: string, now: () => Date = () => new Date()): { ok: true } | { ok: false; reason: TakeDecisionRefusal } {
  const decided = inTransaction((): { ok: true } | { ok: false; reason: TakeDecisionRefusal } => {
    const run = getRun(sessionId);
    const take = getNarrationTake(sessionId, takeId);
    if (!run || !take) return { ok: false, reason: "unknown-take" };
    if (take.state === "kept" || take.state === "discarded") return { ok: false, reason: "take-not-open" };
    if (take.state !== "ready" || take.baseVersion !== currentNarration(sessionId)?.version) return { ok: false, reason: "take-not-ready" };
    if (assemblyInProgress(run)) return { ok: false, reason: "assembly-in-progress" };
    if (!decideNarrationTake(takeId, "kept", now().toISOString())) return { ok: false, reason: "take-not-ready" };
    const scenes = getScenesForRun(sessionId);
    const first = scenes.find((scene) => scene.id === take.firstSceneId)!.index;
    const last = scenes.find((scene) => scene.id === take.lastSceneId)!.index;
    const remove = db.prepare("DELETE FROM scene_pause_edits WHERE scene_id = ?");
    for (const scene of scenes) if (scene.index >= first && scene.index <= last) remove.run(scene.id);
    db.prepare("UPDATE runs SET final_video_stale = 1 WHERE id = ? AND final_video_path IS NOT NULL").run(sessionId);
    return { ok: true };
  });
  if (decided.ok) {
    logger.info({ event: "narration-take.kept", sessionId, takeId });
    broadcast(sessionId);
  }
  return decided;
}

export function discardNarrationTake(sessionId: string, takeId: string, now: () => Date = () => new Date()): { ok: true } | { ok: false; reason: TakeDecisionRefusal } {
  const take = getNarrationTake(sessionId, takeId);
  if (!take) return { ok: false, reason: "unknown-take" };
  if (!decideNarrationTake(takeId, "discarded", now().toISOString())) {
    return { ok: false, reason: take.state === "generating" ? "take-not-ready" : "take-not-open" };
  }
  logger.info({ event: "narration-take.discarded", sessionId, takeId });
  broadcast(sessionId);
  return { ok: true };
}
