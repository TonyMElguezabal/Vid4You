import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, getRun, insertVoiceOver, resetAll, writeArtefactOnce } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { ulid } from "../src/util/ulid.ts";

// listen-to-voice-over, tasks 1.1-1.2 — the narration audio route and `narration.audioUrl`, before any scene exists.
// The kept-take cases (version 2, FLAC) are in narration-take-routes.test.ts, which has a take's setup.

const MP3 = Buffer.from("0123456789abcdefghij");
let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

/** A session whose voice-over is stored and that has no decomposition and no scene yet. */
function voiceOverOnly(audioPath?: string): string {
  const runId = ulid();
  createRun(runId, "Voice-over test", "A short script.", "en");
  const stored = audioPath ?? writeArtefactOnce(getRun(runId)!.projectFolder, "voice-over.mp3", MP3);
  insertVoiceOver({ runId, audioPath: stored, timestampsPath: null, durationSeconds: 1, sizeBytes: MP3.length, nativeTimestampsAvailable: false, providerRequestId: "fake", completedAt: new Date().toISOString() });
  return runId;
}

const read = async (runId: string) => (await app.inject({ method: "GET", url: `/sessions/${runId}` })).json<SessionSnapshot>();
const audio = (runId: string, range?: string) => app.inject({ method: "GET", url: `/sessions/${runId}/narration/audio`, headers: range ? { range } : {} });

describe("The session read points at the narration's audio", () => {
  it("carries narration.audioUrl as soon as the voice-over is stored, before any scene", async () => {
    const runId = voiceOverOnly();
    const snapshot = await read(runId);
    expect(snapshot.scenes).toEqual([]);
    expect(snapshot.session.narration).toEqual({ version: 1, audioUrl: `/sessions/${runId}/narration/audio?v=1` });
  });

  it("has no narration before the voice-over is stored", async () => {
    const runId = ulid();
    createRun(runId, "Voice-over test", "A short script.", "en");
    expect((await read(runId)).session.narration).toBeUndefined();
  });
});

describe("GET /sessions/:sessionId/narration/audio", () => {
  it("serves the stored voice-over inline as MP3, with byte ranges", async () => {
    const runId = voiceOverOnly();
    const whole = await audio(runId);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-type"]).toBe("audio/mpeg");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    expect(whole.headers["content-disposition"]).toBeUndefined();
    expect(whole.rawPayload.equals(MP3)).toBe(true);

    const part = await audio(runId, "bytes=2-5");
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe(`bytes 2-5/${MP3.length}`);
    expect(part.headers["content-length"]).toBe("4");
    expect(part.body).toBe("2345");

    const past = await audio(runId, `bytes=${MP3.length}-`);
    expect(past.statusCode).toBe(416);
    expect(past.headers["content-range"]).toBe(`bytes */${MP3.length}`);
  });

  it("answers 404 for an unknown session and for a session with no voice-over", async () => {
    expect((await audio(ulid())).statusCode).toBe(404);
    const runId = ulid();
    createRun(runId, "Voice-over test", "A short script.", "en");
    expect((await audio(runId)).statusCode).toBe(404);
  });

  it("answers 404 for a missing file and for a stored path outside the project folder", async () => {
    expect((await audio(voiceOverOnly("voice-over-gone.mp3"))).statusCode).toBe(404);
    expect((await audio(voiceOverOnly("../escaped.mp3"))).statusCode).toBe(404);
  });
});
