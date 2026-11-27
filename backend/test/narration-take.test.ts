import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssemblySubtitles } from "../src/assemblySubtitles.ts";
import * as concurrency from "../src/concurrency.ts";
import {
  bindVoiceProvider,
  currentNarration,
  getNarrationTake,
  getNarrationTakes,
  getRun,
  getScenePauseEdits,
  getVoiceOver,
  resolveArtefactPath,
  requestFinalVideoRebuild,
  setScenePauseEdit,
} from "../src/db.ts";
import {
  contextAfter,
  contextBefore,
  createNarrationTake,
  discardNarrationTake,
  keepNarrationTake,
  MAX_TAKE_CHARACTERS,
  narrationReadModel,
  quoteNarrationTake,
  resetNarrationTakeAudioTools,
  setNarrationTakeAudioTools,
  setNarrationTakeLogger,
  type NarrationTakeAudioTools,
} from "../src/narrationTake.ts";
import { rebuildFinalVideo } from "../src/finalVideoRebuild.ts";
import { getProfile, insertProfile } from "../src/providerProfiles.ts";
import { countedAttemptsOfRuns } from "../src/providerUsageReport.ts";
import { loadSessionPauses } from "../src/sessionPauses.ts";
import { createStubVoiceProvider, resetVoiceProviderRegistry, setVoiceProviderRegistry, type StubVoiceProviderMode } from "../src/voiceProvider.ts";
import { limitSeconds } from "./phaseLimit.ts";
import { finishedSession, resetRebuildEnvironment, SCRIPT, waitFor } from "./rebuildFixtures.ts";

// redo-scene-narration (JOS-282), tasks 3.1, 3.4 and 3.6 — the quote, a take's request and build, keep and discard.
// The fixture's narration is two scenes ("Scene 1." 0-5 s, "Scene 2." 5-10 s, 0.7 s of speech each). The stub reads a
// take over the first 75% of 5 s of silent audio: one scene speaks 3.75 s, each of two about 1.8 s, and both fit.

const VOICE = "voice-test";
const PARAMETERS = { voiceId: "voice-1", model: "model-1", outputFormat: "mp3_44100_128", speed: "default" };
const NOW = "2026-11-26T00:00:00.000Z";

const tools: NarrationTakeAudioTools = {
  probeDurationSeconds: async () => 5,
  measureSpeech: async () => ({ rmsDb: -20, peakDb: -6 }),
  spliceNarration: async (request) => {
    writeFileSync(request.outputPath, "flac-bytes");
    return { totalSamples: 441000 };
  },
  writePreview: async (_narration, _section, _duration, output) => writeFileSync(output, "m4a-bytes"),
};

let stub: ReturnType<typeof createStubVoiceProvider>;

function useVoice(mode: StubVoiceProviderMode, price: boolean = true, audioSeconds = 5): void {
  if (!getProfile(VOICE)) insertProfile(
    { id: VOICE, stage: "voice", adapterType: "elevenlabs-voice", label: "Test voice", parameters: { ...PARAMETERS, ...(price ? { pricePerUnit: 0.0001, priceCurrency: "USD" } : {}) } },
    NOW,
  );
  stub = createStubVoiceProvider(mode, { audioSeconds });
  setVoiceProviderRegistry({ defaultIdentifier: VOICE, adapters: { [VOICE]: stub } });
}

async function session(options: { price?: boolean; mode?: StubVoiceProviderMode } = {}) {
  useVoice(options.mode ?? "success", options.price ?? true);
  const built = await finishedSession();
  bindVoiceProvider(built.runId, VOICE);
  const [first, second] = built.sceneIds as [string, string];
  return { ...built, first, second };
}

const settled = (runId: string) => () => getNarrationTakes(runId).every((take) => take.state !== "generating");

beforeEach(() => {
  resetRebuildEnvironment();
  setNarrationTakeAudioTools(tools);
});

afterEach(() => {
  vi.useRealTimers();
  resetNarrationTakeAudioTools();
  resetVoiceProviderRegistry();
});

describe("the quote (task 3.1)", () => {
  it("gives the text spanning the selected scenes, its characters and its cost, and calls no provider", async () => {
    const { runId, first, second } = await session();

    expect(quoteNarrationTake(runId, first, second)).toEqual({
      ok: true,
      quote: { text: SCRIPT, characters: SCRIPT.length, estimatedCost: { amount: expect.closeTo(SCRIPT.length * 0.0001, 12) as number, currency: "USD" }, pauseEditsReset: [] },
    });
    expect(quoteNarrationTake(runId, second, second)).toMatchObject({ ok: true, quote: { text: "Scene 2.", characters: 8 } });
    expect(stub.calls).toHaveLength(0);
    expect(getNarrationTakes(runId)).toHaveLength(0);
  });

  it("has no cost when the voice provider is unpriced", async () => {
    const { runId, first } = await session({ price: false });
    expect(quoteNarrationTake(runId, first, first)).toMatchObject({ ok: true, quote: { estimatedCost: null } });
  });

  it("lists the selected scenes whose pause edits would be reset", async () => {
    const { runId, first, second } = await session();
    setScenePauseEdit(runId, second, 2.0);
    expect(quoteNarrationTake(runId, first, second)).toMatchObject({ ok: true, quote: { pauseEditsReset: [2] } });
    expect(quoteNarrationTake(runId, first, first)).toMatchObject({ ok: true, quote: { pauseEditsReset: [] } });
  });

  it("refuses an unknown scene, a scene of another session, and scenes in the wrong order", async () => {
    const { runId, first, second } = await session();
    const other = await finishedSession();
    expect(quoteNarrationTake(runId, first, "no-such-scene")).toEqual({ ok: false, reason: "unknown-scene" });
    expect(quoteNarrationTake("no-such-session", first, second)).toEqual({ ok: false, reason: "unknown-scene" });
    expect(quoteNarrationTake(runId, first, other.sceneIds[1]!)).toEqual({ ok: false, reason: "unknown-scene" });
    expect(quoteNarrationTake(runId, second, first)).toEqual({ ok: false, reason: "invalid-range" });
  });

  it("refuses more than 2,500 characters", () => {
    expect(MAX_TAKE_CHARACTERS).toBe(2500);
  });

  it("refuses a session whose narration cannot be located", async () => {
    useVoice("success");
    const { runId, sceneIds } = await finishedSession({ timestamps: false });
    expect(quoteNarrationTake(runId, sceneIds[0]!, sceneIds[1]!)).toEqual({ ok: false, reason: "narration-not-located" });
  });
});

describe("creating a take (task 3.4)", () => {
  it("records the take, sends one request with the text, its context and the bound profile, and builds a take for review", async () => {
    const { runId, first, second } = await session();
    const voiceOverBefore = getVoiceOver(runId);

    const created = createNarrationTake(runId, first, first);
    expect(created).toEqual({ ok: true, takeId: expect.any(String) as string });
    if (!created.ok) return;
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "generating", number: 1, baseVersion: 1, textLength: 8, providerId: VOICE });

    await waitFor(settled(runId));
    expect(stub.calls).toEqual([
      { text: "Scene 1.", language: "en", voiceId: "voice-1", model: "model-1", outputFormat: "mp3_44100_128", speed: "default", previousText: "", nextText: " Scene 2." },
    ]);
    const take = getNarrationTake(runId, created.takeId)!;
    expect(take).toMatchObject({
      state: "ready",
      providerOutcome: "success",
      providerRequestId: "stub-take-request",
      takeAudioPath: "narration-take-1.mp3",
      takeTimestampsPath: "narration-take-1-provider-timestamps.json",
      narrationPath: "narration-take-1.flac",
      narrationTimestampsPath: "narration-take-1-timestamps.json",
      previewPath: "narration-take-1-preview.m4a",
    });
    // The new narration's timestamps: scene 1's new speech starts at 0, scene 2's characters are the base's.
    const projectFolder = getRun(runId)!.projectFolder;
    const stored = JSON.parse(readFileSync(resolveArtefactPath(projectFolder, take.narrationTimestampsPath!), "utf8")) as { mechanism: string; characters: Array<{ text: string; start: number }> };
    expect(stored.mechanism).toBe("alignment");
    expect(stored.characters[0]).toMatchObject({ text: "S", start: 0 });
    expect(stored.characters.at(-7)).toMatchObject({ text: "S", start: 5 });
    // Nothing of the session changed.
    expect(getVoiceOver(runId)).toEqual(voiceOverBefore);
    expect(currentNarration(runId)?.version).toBe(1);
    expect(second).toBeDefined();
  });

  it("holds a voice concurrency slot while the request is out", async () => {
    const { runId, first } = await session({ mode: "hang" });
    createNarrationTake(runId, first, first);
    expect(concurrency.stats("voice").inFlight).toBe(1);
    stub.release();
    await waitFor(settled(runId));
    expect(concurrency.stats("voice").inFlight).toBe(0);
  });

  it("fails at the voice time limit, and drops an answer that arrives later", async () => {
    const { runId, first } = await session({ mode: "hang" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await vi.advanceTimersByTimeAsync(limitSeconds("voice") * 1000 + 1);
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "failed", providerOutcome: "timed-out", failure: expect.stringContaining("time limit") as string });
    vi.useRealTimers();
    stub.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "failed", narrationPath: null });
    expect(stub.calls).toHaveLength(1);
  });

  it("fails on a provider error without retrying, and accepts a new take afterwards", async () => {
    const { runId, first } = await session({ mode: "transient-failure" });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "failed", providerOutcome: "transient" });
    expect(stub.calls).toHaveLength(1);
    expect(discardNarrationTake(runId, created.takeId)).toEqual({ ok: true });
    expect(createNarrationTake(runId, first, first)).toMatchObject({ ok: true });
  });

  it("fails a reading without timestamps as not usable", async () => {
    const { runId, first } = await session({ mode: "success-without-timestamps" });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)?.failure).toBe("The voice provider gives no character timestamps, which a redo needs.");
  });

  it("fails without a call when the provider is not available", async () => {
    const { runId, first } = await session();
    setVoiceProviderRegistry({ defaultIdentifier: VOICE, adapters: {} });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "failed", providerOutcome: "not-retryable" });
    expect(stub.calls).toHaveLength(0);
  });

  it("names the scene that does not fit", async () => {
    const { runId, first } = await session();
    useVoice("success", true, 10);
    setNarrationTakeAudioTools({ ...tools, probeDurationSeconds: async () => 10 });
    // Scene 1 read over 7.5 s: 7.5 s of speech in a 5 s interval, too long by 7.5 + 0.2 - 5 = 2.7 s.
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)?.failure).toMatch(/^Scene 1's new reading is too long by 2\.\d s at its normal speed\.$/);
  });

  it("refuses a second take while one is open, including two back-to-back calls", async () => {
    const { runId, first, second } = await session({ mode: "hang" });
    expect(createNarrationTake(runId, first, second)).toMatchObject({ ok: true });
    expect(createNarrationTake(runId, first, second)).toEqual({ ok: false, reason: "take-in-progress" });
    expect(stub.calls).toHaveLength(1);
    stub.release();
    await waitFor(settled(runId));
  });

  it("refuses while a final-video rebuild is requested", async () => {
    const { runId, first } = await session();
    requestFinalVideoRebuild(runId);
    expect(createNarrationTake(runId, first, first)).toEqual({ ok: false, reason: "assembly-in-progress" });
    expect(stub.calls).toHaveLength(0);
  });
});

describe("keep and discard (task 3.6)", () => {
  async function readyTake(range: "first" | "both" = "both") {
    const built = await session();
    const created = createNarrationTake(built.runId, built.first, range === "both" ? built.second : built.first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(built.runId));
    expect(getNarrationTake(built.runId, created.takeId)?.state).toBe("ready");
    return { ...built, takeId: created.takeId };
  }

  it("keeps a ready take atomically: kept, its scenes' pause edits removed, the final video stale, and no assembly started", async () => {
    const { runId, first, second, takeId, calls } = await readyTake("first");
    setScenePauseEdit(runId, first, 2.0);
    setScenePauseEdit(runId, second, 2.5);
    const assembliesBefore = calls.length;

    expect(keepNarrationTake(runId, takeId)).toEqual({ ok: true });

    expect(getNarrationTake(runId, takeId)?.state).toBe("kept");
    expect([...getScenePauseEdits(runId)]).toEqual([[second, 2.5]]);
    expect(currentNarration(runId)).toMatchObject({ version: 2, takeId, audioPath: "narration-take-1.flac", spliced: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.length).toBe(assembliesBefore);
    expect(getRun(runId)).toMatchObject({ finalVideoPath: "final-video.mp4", finalVideoStale: true, rebuildRequestedAt: null });

    // The User checks the scenes, then rebuilds (design Decision 15).
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls.length).toBe(assembliesBefore + 1);
    expect(getRun(runId)?.finalVideoStale).toBe(false);
    // The first assembly copied the original MP3; the rebuild muxes the spliced FLAC, encoded once (task 4.2).
    expect(calls[0]).toMatchObject({ voiceOverPath: expect.stringMatching(/voice-over\.mp3$/) as string });
    expect(calls[0]!.encodeNarration).toBeUndefined();
    expect(calls.at(-1)).toMatchObject({ voiceOverPath: expect.stringMatching(/narration-take-1\.flac$/) as string, encodeNarration: true });
  });

  it("refuses to keep twice, an unknown take, a failed take, and during an assembly", async () => {
    const { runId, takeId } = await readyTake();
    expect(keepNarrationTake(runId, "no-such-take")).toEqual({ ok: false, reason: "unknown-take" });
    requestFinalVideoRebuild(runId);
    expect(keepNarrationTake(runId, takeId)).toEqual({ ok: false, reason: "assembly-in-progress" });
    expect(getNarrationTake(runId, takeId)?.state).toBe("ready");
  });

  it("answers take-not-open for a kept take and take-not-ready for a failed one", async () => {
    const { runId, takeId } = await readyTake();
    expect(keepNarrationTake(runId, takeId)).toEqual({ ok: true });
    expect(keepNarrationTake(runId, takeId)).toEqual({ ok: false, reason: "take-not-open" });
    expect(discardNarrationTake(runId, takeId)).toEqual({ ok: false, reason: "take-not-open" });

    const failing = await session({ mode: "not-retryable-failure" });
    const created = createNarrationTake(failing.runId, failing.first, failing.first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(failing.runId));
    expect(keepNarrationTake(failing.runId, created.takeId)).toEqual({ ok: false, reason: "take-not-ready" });
  });

  it("discards a ready take and changes nothing else", async () => {
    const { runId, takeId, second } = await readyTake();
    setScenePauseEdit(runId, second, 2.5);
    const before = getRun(runId);

    expect(discardNarrationTake(runId, takeId)).toEqual({ ok: true });

    expect(getNarrationTake(runId, takeId)?.state).toBe("discarded");
    expect(getRun(runId)).toEqual(before);
    expect([...getScenePauseEdits(runId)]).toEqual([[second, 2.5]]);
    expect(currentNarration(runId)?.version).toBe(1);
  });

  it("builds a second take on version 2", async () => {
    const { runId, first, takeId } = await readyTake();
    keepNarrationTake(runId, takeId);

    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ state: "ready", number: 2, baseVersion: 2 });
    expect(keepNarrationTake(runId, created.takeId)).toEqual({ ok: true });
    expect(currentNarration(runId)).toMatchObject({ version: 3, audioPath: "narration-take-2.flac" });
  });
});

describe("Rebuild final video while a take is open (design Decision 15)", () => {
  it("is refused with take-in-progress while a take is generating or ready, and accepted once it is discarded", async () => {
    const { runId, first, calls } = await session();
    setScenePauseEdit(runId, first, 2.0);
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    expect(getNarrationTake(runId, created.takeId)?.state).toBe("generating");
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "take-in-progress" });

    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)?.state).toBe("ready");
    expect(rebuildFinalVideo(runId)).toEqual({ ok: false, reason: "take-in-progress" });
    expect(getRun(runId)?.rebuildRequestedAt).toBeNull();
    const assembliesBefore = calls.length;

    expect(discardNarrationTake(runId, created.takeId)).toEqual({ ok: true });
    expect(rebuildFinalVideo(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
    expect(calls.length).toBe(assembliesBefore + 1);
  });
});

describe("the readers follow the current narration (task 4.1)", () => {
  it("derives a redone scene's pause and subtitle times from the kept take, and leaves every other scene's unchanged", async () => {
    const { runId, first, second } = await session();
    const subtitlesBefore = buildAssemblySubtitles(runId, [], 10)!;
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(keepNarrationTake(runId, created.takeId)).toEqual({ ok: true });

    const pauses = new Map(loadSessionPauses(runId)!.scenes.map((scene) => [scene.id, scene.originalPauseSeconds]));
    // Scene 1's new speech is 3.75 s in its 5 s interval; scene 2 keeps its 0.7 s of speech.
    expect(pauses.get(first)).toBeCloseTo(1.25, 3);
    expect(pauses.get(second)).toBeCloseTo(4.3, 3);

    const subtitlesAfter = buildAssemblySubtitles(runId, [], 10)!;
    expect(subtitlesAfter[0]!.endSeconds).toBeGreaterThan(subtitlesBefore[0]!.endSeconds + 2);
    expect(subtitlesAfter.at(-1)).toEqual(subtitlesBefore.at(-1));
  });
});

describe("takes in the usage reports (task 4.3)", () => {
  const voiceRows = (runId: string) => countedAttemptsOfRuns([runId]).filter((attempt) => attempt.stage === "voice");

  it("counts a sent take as a voice attempt of its provider, billed by its characters, even when it did not fit", async () => {
    const { runId, first, second } = await session();
    const fitted = createNarrationTake(runId, first, second);
    if (!fitted.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    discardNarrationTake(runId, fitted.takeId);
    // A reading that does not fit is still billed by the provider.
    useVoice("success", true, 10);
    setNarrationTakeAudioTools({ ...tools, probeDurationSeconds: async () => 10 });
    const unfitted = createNarrationTake(runId, first, first);
    if (!unfitted.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, unfitted.takeId)?.state).toBe("failed");

    expect(voiceRows(runId)).toEqual([
      expect.objectContaining({ providerId: VOICE, outcome: "success", unit: "voice_characters", units: SCRIPT.length }),
      expect.objectContaining({ providerId: VOICE, outcome: "success", unit: "voice_characters", units: 8 }),
    ]);
  });

  it("counts a failed call by its outcome, and does not count a take still generating", async () => {
    const { runId, first } = await session({ mode: "hang" });
    createNarrationTake(runId, first, first);
    expect(voiceRows(runId)).toEqual([]);
    stub.release();
    await waitFor(settled(runId));

    const failing = await session({ mode: "transient-failure" });
    const created = createNarrationTake(failing.runId, failing.first, failing.first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(failing.runId));
    expect(voiceRows(failing.runId)).toEqual([expect.objectContaining({ outcome: "transient", units: 8 })]);
  });
});

describe("the context, the causes and the logs (task 3.5)", () => {
  it("sends at most 1,000 characters of context on each side, cut at a whitespace", () => {
    const words = "word ".repeat(400);
    const before = contextBefore(`${words}TEXT`, words.length);
    expect(before.length).toBeLessThanOrEqual(1000);
    expect(before.startsWith(" ")).toBe(true);
    const after = contextAfter(`TEXT${words}`, 4);
    expect(after.length).toBeLessThanOrEqual(1000);
    expect(after.endsWith(" ")).toBe(true);
    expect(contextBefore("Short. TEXT", 7)).toBe("Short. ");
    expect(contextAfter("TEXT end.", 4)).toBe(" end.");
  });

  it("says a reading is too short, and by how much at its normal speed", async () => {
    const { runId, first } = await session();
    useVoice("success", true, 0.5);
    setNarrationTakeAudioTools({ ...tools, probeDurationSeconds: async () => 0.5 });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    // 0.375 s of speech in 5 s leaves 4.6 s; the cap is the scene's original 4.3 s pause.
    expect(getNarrationTake(runId, created.takeId)?.failure).toBe(
      "Scene 1's new reading is too short by 0.3 s at its normal speed: even 5% slower, its pause would be longer than 4.3 s.",
    );
  });

  it("fails with a readable cause when the new narration cannot be built, and logs ids, lengths and outcomes only", async () => {
    const lines: Array<Record<string, unknown>> = [];
    setNarrationTakeLogger({ info: (fields) => lines.push(fields), warn: (fields) => lines.push(fields) });
    const { runId, first } = await session();
    setNarrationTakeAudioTools({ ...tools, spliceNarration: async () => Promise.reject(new Error("ffmpeg said /private/path")) });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    setNarrationTakeLogger({ info: () => {}, warn: () => {} });

    expect(getNarrationTake(runId, created.takeId)?.failure).toBe("The new narration could not be built from the new reading. Try again.");
    expect(lines.map((line) => line.event)).toEqual(["narration-take.requested", "narration-take.finished", "narration-take.build-error"]);
    expect(lines[1]).toMatchObject({ takeId: created.takeId, textLength: 8, outcome: "build-failed" });
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain("Scene 1.");
    expect(logged).not.toContain("/private/path");
  });
});

describe("more take paths (task 3.5)", () => {
  it("redoes a later scene alone: the base before it stays, and the new speech starts at its interval", async () => {
    const { runId, second } = await session();
    const created = createNarrationTake(runId, second, second);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    const take = getNarrationTake(runId, created.takeId)!;
    expect(take.state).toBe("ready");
    expect(stub.calls[0]).toMatchObject({ text: "Scene 2.", previousText: "Scene 1. ", nextText: "" });
    const stored = JSON.parse(readFileSync(resolveArtefactPath(getRun(runId)!.projectFolder, take.narrationTimestampsPath!), "utf8")) as { characters: Array<{ text: string; start: number }> };
    expect(stored.characters.slice(0, 7).map((character) => character.start)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((start) => expect.closeTo(start, 9) as number));
    expect(stored.characters[7]).toMatchObject({ text: "S", start: 5 });
  });

  it("fails a reading whose timestamps cannot be read", async () => {
    const { runId, first } = await session();
    setVoiceProviderRegistry({
      defaultIdentifier: VOICE,
      adapters: { [VOICE]: { synthesize: async () => ({ kind: "success", audio: Buffer.from("mp3"), nativeTimestamps: { unexpected: true } }) } },
    });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)?.failure).toBe("The new reading's timestamps do not match the text, so it cannot be fitted. Try again.");
  });

  it("fails as transient when the adapter throws", async () => {
    const { runId, first } = await session();
    setVoiceProviderRegistry({ defaultIdentifier: VOICE, adapters: { [VOICE]: { synthesize: async () => Promise.reject(new Error("boom")) } } });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)).toMatchObject({ providerOutcome: "transient", failure: "The voice provider call failed unexpectedly." });
  });

  it("refuses to discard or keep a take that is still generating, and shows it without a preview", async () => {
    const { runId, first } = await session({ mode: "hang" });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    expect(discardNarrationTake(runId, created.takeId)).toEqual({ ok: false, reason: "take-not-ready" });
    expect(keepNarrationTake(runId, created.takeId)).toEqual({ ok: false, reason: "take-not-ready" });
    expect(discardNarrationTake(runId, "no-such-take")).toEqual({ ok: false, reason: "unknown-take" });
    expect(narrationReadModel(runId).narration).toEqual({ version: 1, take: { takeId: created.takeId, state: "generating", firstSceneIndex: 1, lastSceneIndex: 1 } });
    stub.release();
    await waitFor(settled(runId));
    expect(narrationReadModel(runId).narration?.take).toMatchObject({ state: "failed", failure: "The voice provider gives no character timestamps, which a redo needs." });
  });
});

describe("refusals from the stored narration (task 3.1)", () => {
  const timestampsFile = (runId: string) => resolveArtefactPath(getRun(runId)!.projectFolder, "narration-timestamps.json");

  it("refuses when the stored timestamps cannot be read, or do not match the script", async () => {
    const { runId, first } = await session();
    writeFileSync(timestampsFile(runId), JSON.stringify({ mechanism: "alignment", characters: [{ text: "Other.", start: 0, end: 1 }] }));
    expect(quoteNarrationTake(runId, first, first)).toEqual({ ok: false, reason: "narration-not-located" });
    writeFileSync(timestampsFile(runId), "{");
    expect(quoteNarrationTake(runId, first, first)).toEqual({ ok: false, reason: "narration-not-located" });
    expect(narrationReadModel(runId).redoable.size).toBe(0);
  });

  it("uses the active voice provider for a session with no bound one", async () => {
    useVoice("success");
    const { runId, sceneIds } = await finishedSession();
    expect(quoteNarrationTake(runId, sceneIds[0]!, sceneIds[0]!)).toMatchObject({ ok: true, quote: { characters: 8 } });
  });

  it("sends no context on a side whose 1,000 characters have no whitespace", () => {
    const block = "x".repeat(1200);
    expect(contextBefore(`${block}TEXT`, block.length)).toBe("");
    expect(contextAfter(`TEXT${block}`, 4)).toBe("");
  });

  it("keeps a provider reason that already ends a sentence", async () => {
    const { runId, first } = await session();
    setVoiceProviderRegistry({ defaultIdentifier: VOICE, adapters: { [VOICE]: { synthesize: async () => ({ kind: "failed_not_retryable", reason: "the key was refused." }) } } });
    const created = createNarrationTake(runId, first, first);
    if (!created.ok) throw new Error("should be accepted");
    await waitFor(settled(runId));
    expect(getNarrationTake(runId, created.takeId)?.failure).toBe("The key was refused.");
  });
});
