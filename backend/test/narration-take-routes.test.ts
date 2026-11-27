import { writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindVoiceProvider, getNarrationTakes, setScenePauseEdit } from "../src/db.ts";
import { resetNarrationTakeAudioTools, setNarrationTakeAudioTools } from "../src/narrationTake.ts";
import { insertProfile } from "../src/providerProfiles.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { createStubVoiceProvider, resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import { finishedSession, resetRebuildEnvironment, SCRIPT, waitFor } from "./rebuildFixtures.ts";

// redo-scene-narration (JOS-282), task 4.4 — the five routes and the session read. The preview bytes are a fixed fake.

const VOICE = "voice-test";
const PREVIEW = Buffer.from("0123456789abcdefghij");
let app: FastifyInstance;

beforeEach(async () => {
  resetRebuildEnvironment();
  insertProfile(
    { id: VOICE, stage: "voice", adapterType: "elevenlabs-voice", label: "Test voice", parameters: { voiceId: "v", model: "m", outputFormat: "mp3_44100_128", speed: "default", pricePerUnit: 0.0001, priceCurrency: "USD" } },
    "2026-11-26T00:00:00.000Z",
  );
  setVoiceProviderRegistry({ defaultIdentifier: VOICE, adapters: { [VOICE]: createStubVoiceProvider("success", { audioSeconds: 5 }) } });
  setNarrationTakeAudioTools({
    probeDurationSeconds: async () => 5,
    measureSpeech: async () => ({ rmsDb: -20, peakDb: -6 }),
    spliceNarration: async (request) => {
      writeFileSync(request.outputPath, "flac");
      return { totalSamples: 1 };
    },
    writePreview: async (_narration, _section, _duration, output) => writeFileSync(output, PREVIEW),
  });
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  resetNarrationTakeAudioTools();
  resetVoiceProviderRegistry();
});

async function session() {
  const built = await finishedSession();
  bindVoiceProvider(built.runId, VOICE);
  const [first, second] = built.sceneIds as [string, string];
  return { ...built, first, second, base: `/sessions/${built.runId}/narration-takes` };
}

const read = async (runId: string) => (await app.inject({ method: "GET", url: `/sessions/${runId}` })).json<SessionSnapshot>();
const settled = (runId: string) => () => getNarrationTakes(runId).every((take) => take.state !== "generating");

async function readyTake() {
  const built = await session();
  const created = await app.inject({ method: "POST", url: built.base, payload: { firstSceneId: built.first, lastSceneId: built.second } });
  expect(created.statusCode).toBe(202);
  const { takeId } = created.json<{ ok: boolean; takeId: string }>();
  await waitFor(settled(built.runId));
  return { ...built, takeId };
}

describe("GET …/narration-takes/quote", () => {
  it("answers the text, characters, cost and the pause edits that would be reset", async () => {
    const { runId, first, second, base } = await session();
    setScenePauseEdit(runId, second, 2);
    const res = await app.inject({ method: "GET", url: `${base}/quote?firstSceneId=${first}&lastSceneId=${second}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: SCRIPT, characters: SCRIPT.length, estimatedCost: { amount: expect.closeTo(0.0017, 9) as number, currency: "USD" }, pauseEditsReset: [2], limit: 2500 });
  });

  it("answers 404 unknown-scene, 422 invalid-range and 400 for a missing scene", async () => {
    const { first, second, base } = await session();
    expect((await app.inject({ method: "GET", url: `${base}/quote?firstSceneId=${first}&lastSceneId=00000000-0000-4000-8000-000000000000` })).json()).toEqual({ ok: false, reason: "unknown-scene" });
    const wrongOrder = await app.inject({ method: "GET", url: `${base}/quote?firstSceneId=${second}&lastSceneId=${first}` });
    expect(wrongOrder.statusCode).toBe(422);
    expect(wrongOrder.json()).toMatchObject({ reason: "invalid-range" });
    expect((await app.inject({ method: "GET", url: `${base}/quote?firstSceneId=${first}` })).statusCode).toBe(400);
  });
});

describe("POST …/narration-takes, keep and discard", () => {
  it("accepts a take with 202, refuses a second with 409, and shows it in the session read", async () => {
    const { runId, first, second, base } = await readyTake();
    const again = await app.inject({ method: "POST", url: base, payload: { firstSceneId: first, lastSceneId: second } });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ ok: false, reason: "take-in-progress" });

    const snapshot = await read(runId);
    const take = getNarrationTakes(runId)[0]!;
    expect(snapshot.session.narration).toEqual({
      version: 1,
      take: { takeId: take.id, state: "ready", firstSceneIndex: 1, lastSceneIndex: 2, previewUrl: `/sessions/${runId}/narration-takes/${take.id}/preview` },
    });
    expect(snapshot.scenes.map((scene) => [scene.narrationRedoable, scene.narrationRedone])).toEqual([[true, undefined], [true, undefined]]);
    expect(JSON.stringify(snapshot.session.narration)).not.toContain("Scene 1.");
  });

  it("keeps a take: the narration version is 2, both scenes show as redone, and the final video waits for the User", async () => {
    const { runId, base, takeId } = await readyTake();
    const rebuild = () => app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild`, payload: {} });
    const refused = await rebuild();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ ok: false, reason: "take-in-progress" });

    const kept = await app.inject({ method: "POST", url: `${base}/${takeId}/keep` });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toEqual({ ok: true });
    const snapshot = await read(runId);
    expect(snapshot.session.narration).toEqual({ version: 2 });
    expect(snapshot.scenes.map((scene) => scene.narrationRedone)).toEqual([true, true]);
    expect(snapshot.session.finalVideo).toMatchObject({ version: 1, staleScenes: true });
    expect(snapshot.session.state).toBe("final-video");
    expect((await rebuild()).statusCode).toBe(202);

    const twice = await app.inject({ method: "POST", url: `${base}/${takeId}/keep` });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toEqual({ ok: false, reason: "take-not-open" });
  });

  it("discards a take, and answers 404 for an unknown take or one of another session", async () => {
    const { base, takeId } = await readyTake();
    const other = await session();
    expect((await app.inject({ method: "POST", url: `${other.base}/${takeId}/discard` })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `${base}/01ARZ3NDEKTSV4RRFFQ69G5FAV/keep` })).json()).toEqual({ ok: false, reason: "unknown-take" });
    const discarded = await app.inject({ method: "POST", url: `${base}/${takeId}/discard` });
    expect(discarded.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${base}/${takeId}/preview` })).statusCode).toBe(404);
  });
});

describe("GET …/narration-takes/:takeId/preview", () => {
  it("serves the preview inline as AAC in MP4, with byte ranges", async () => {
    const { base, takeId } = await readyTake();
    const whole = await app.inject({ method: "GET", url: `${base}/${takeId}/preview` });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-type"]).toBe("audio/mp4");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    expect(whole.headers["content-disposition"]).toBeUndefined();
    expect(whole.rawPayload.equals(PREVIEW)).toBe(true);

    const part = await app.inject({ method: "GET", url: `${base}/${takeId}/preview`, headers: { range: "bytes=2-5" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe(`bytes 2-5/${PREVIEW.length}`);
    expect(part.body).toBe("2345");

    const past = await app.inject({ method: "GET", url: `${base}/${takeId}/preview`, headers: { range: "bytes=99-" } });
    expect(past.statusCode).toBe(416);
  });

  it("answers 404 for a take of another session", async () => {
    const { takeId } = await readyTake();
    const other = await session();
    expect((await app.inject({ method: "GET", url: `${other.base}/${takeId}/preview` })).statusCode).toBe(404);
  });
});
