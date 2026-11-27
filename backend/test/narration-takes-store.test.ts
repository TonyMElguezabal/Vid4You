import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  currentNarration,
  db,
  decideNarrationTake,
  failGeneratingNarrationTakes,
  failNarrationTake,
  getNarrationTake,
  getNarrationTakes,
  insertNarrationTake,
  markNarrationTakeReady,
} from "../src/db.ts";
import { NARRATION_TAKE_RESTART_CAUSE } from "../src/orchestrator.ts";
import { finishedSession, resetRebuildEnvironment } from "./rebuildFixtures.ts";
import { simulateRestart } from "./restartHelpers.ts";

// redo-scene-narration (JOS-282), design Decisions 2 and 8 — the narration_takes record and the current narration.

const READY_FILES = {
  takeAudioPath: "narration-take-1.mp3",
  takeTimestampsPath: "narration-take-1-provider-timestamps.json",
  narrationPath: "narration-take-1.flac",
  narrationTimestampsPath: "narration-take-1-timestamps.json",
  previewPath: "narration-take-1-preview.m4a",
};

async function sessionWithTake() {
  const session = await finishedSession();
  const take = insertNarrationTake({
    runId: session.runId,
    firstSceneId: session.sceneIds[0]!,
    lastSceneId: session.sceneIds[1]!,
    textLength: 17,
    providerId: "stub-voice",
    baseVersion: 1,
    requestedAt: "2026-11-26T10:00:00.000Z",
  });
  if (!take) throw new Error("the take was not recorded");
  return { ...session, take };
}

describe("narration_takes (migration 28)", () => {
  beforeEach(() => resetRebuildEnvironment());

  it("is applied on boot and can be re-applied to a database that predates it", () => {
    db.exec("DROP TABLE narration_takes");
    db.prepare("DELETE FROM schema_migrations WHERE version = 28").run();
    expect(applyMigrationsTo(db, 28)).toEqual([28]);
    const columns = (db.prepare("PRAGMA table_info(narration_takes)").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toEqual([
      "id",
      "run_id",
      "number",
      "base_version",
      "first_scene_id",
      "last_scene_id",
      "text_length",
      "provider_id",
      "state",
      "provider_outcome",
      "provider_request_id",
      "failure",
      "take_audio_path",
      "take_timestamps_path",
      "narration_path",
      "narration_timestamps_path",
      "preview_path",
      "requested_at",
      "sent_at",
      "finished_at",
      "decided_at",
    ]);
  });

  it("numbers a session's takes from 1 and starts each one generating", async () => {
    const { runId, sceneIds, take } = await sessionWithTake();
    expect(take).toMatchObject({ runId, number: 1, baseVersion: 1, state: "generating", firstSceneId: sceneIds[0], lastSceneId: sceneIds[1], textLength: 17 });
    failNarrationTake(take.id, "stub failure", "2026-11-26T10:00:01.000Z");
    const second = insertNarrationTake({ runId, firstSceneId: sceneIds[1]!, lastSceneId: sceneIds[1]!, textLength: 8, providerId: "stub-voice", baseVersion: 1, requestedAt: "2026-11-26T10:01:00.000Z" });
    expect(second?.number).toBe(2);
    expect(getNarrationTakes(runId).map((t) => t.number)).toEqual([1, 2]);
  });

  it("allows one open take per session: a second generating or ready take is refused", async () => {
    const { runId, sceneIds, take } = await sessionWithTake();
    const again = () => insertNarrationTake({ runId, firstSceneId: sceneIds[0]!, lastSceneId: sceneIds[0]!, textLength: 8, providerId: "stub-voice", baseVersion: 1, requestedAt: "2026-11-26T10:02:00.000Z" });
    expect(again()).toBeNull();
    expect(markNarrationTakeReady(take.id, READY_FILES, "2026-11-26T10:00:02.000Z")).toBe(true);
    expect(again()).toBeNull();
    expect(decideNarrationTake(take.id, "discarded", "2026-11-26T10:00:03.000Z")).toBe(true);
    expect(again()).not.toBeNull();
  });

  it("refuses to delete a take, and to change a kept or discarded take", async () => {
    const { take } = await sessionWithTake();
    markNarrationTakeReady(take.id, READY_FILES, "2026-11-26T10:00:02.000Z");
    expect(decideNarrationTake(take.id, "kept", "2026-11-26T10:00:03.000Z")).toBe(true);
    expect(() => db.prepare("DELETE FROM narration_takes WHERE id = ?").run(take.id)).toThrow(/locked/);
    expect(() => db.prepare("UPDATE narration_takes SET failure = 'x' WHERE id = ?").run(take.id)).toThrow(/locked/);
  });

  it("decides only open takes: keep needs a ready take, discard a ready or failed one", async () => {
    const { take, runId, sceneIds } = await sessionWithTake();
    expect(decideNarrationTake(take.id, "kept", "2026-11-26T10:00:03.000Z")).toBe(false);
    failNarrationTake(take.id, "stub failure", "2026-11-26T10:00:01.000Z");
    expect(decideNarrationTake(take.id, "kept", "2026-11-26T10:00:03.000Z")).toBe(false);
    expect(decideNarrationTake(take.id, "discarded", "2026-11-26T10:00:03.000Z")).toBe(true);
    expect(getNarrationTake(runId, take.id)?.state).toBe("discarded");
    expect(getNarrationTake(runId, "not-a-take")).toBeUndefined();
    const other = await finishedSession();
    expect(getNarrationTake(other.runId, take.id)).toBeUndefined();
    expect(sceneIds).toHaveLength(2);
  });

  it("marks generating takes failed at boot, and leaves the others", async () => {
    const { take, runId } = await sessionWithTake();
    expect(failGeneratingNarrationTakes("The app restarted before the new reading arrived. Try again.", "2026-11-26T11:00:00.000Z")).toBe(1);
    expect(getNarrationTake(runId, take.id)).toMatchObject({ state: "failed", failure: "The app restarted before the new reading arrived. Try again." });
    expect(failGeneratingNarrationTakes("again", "2026-11-26T11:00:01.000Z")).toBe(0);
  });
});

describe("a restart while a take is generating (design Decision 11)", () => {
  beforeEach(() => resetRebuildEnvironment());

  it("fails the take with the restart cause at boot, and the session has no open take afterwards", async () => {
    const { runId, take } = await sessionWithTake();
    simulateRestart();
    expect(getNarrationTake(runId, take.id)).toMatchObject({ state: "failed", failure: NARRATION_TAKE_RESTART_CAUSE });
  });
});

describe("currentNarration", () => {
  beforeEach(() => resetRebuildEnvironment());

  it("is the original voice-over, version 1, with no kept take", async () => {
    const { runId, take } = await sessionWithTake();
    markNarrationTakeReady(take.id, READY_FILES, "2026-11-26T10:00:02.000Z");
    expect(currentNarration(runId)).toEqual({
      version: 1,
      takeId: null,
      audioPath: "voice-over.mp3",
      timestampsPath: "narration-timestamps.json",
      mechanism: "alignment",
      durationSeconds: 10,
      spliced: false,
    });
  });

  it("is the latest kept take, one version per kept take", async () => {
    const { runId, sceneIds, take } = await sessionWithTake();
    markNarrationTakeReady(take.id, READY_FILES, "2026-11-26T10:00:02.000Z");
    decideNarrationTake(take.id, "kept", "2026-11-26T10:00:03.000Z");
    expect(currentNarration(runId)).toMatchObject({ version: 2, takeId: take.id, audioPath: "narration-take-1.flac", timestampsPath: "narration-take-1-timestamps.json", mechanism: "alignment", durationSeconds: 10, spliced: true });

    const discarded = insertNarrationTake({ runId, firstSceneId: sceneIds[0]!, lastSceneId: sceneIds[0]!, textLength: 8, providerId: "stub-voice", baseVersion: 2, requestedAt: "2026-11-26T10:05:00.000Z" })!;
    failNarrationTake(discarded.id, "stub", "2026-11-26T10:05:01.000Z");
    decideNarrationTake(discarded.id, "discarded", "2026-11-26T10:05:02.000Z");
    const third = insertNarrationTake({ runId, firstSceneId: sceneIds[1]!, lastSceneId: sceneIds[1]!, textLength: 8, providerId: "stub-voice", baseVersion: 2, requestedAt: "2026-11-26T10:06:00.000Z" })!;
    markNarrationTakeReady(third.id, { ...READY_FILES, narrationPath: "narration-take-3.flac", narrationTimestampsPath: "narration-take-3-timestamps.json" }, "2026-11-26T10:06:02.000Z");
    decideNarrationTake(third.id, "kept", "2026-11-26T10:06:03.000Z");
    expect(currentNarration(runId)).toMatchObject({ version: 3, takeId: third.id, audioPath: "narration-take-3.flac" });
  });

  it("is undefined for a session without a voice-over", () => {
    expect(currentNarration("no-such-session")).toBeUndefined();
  });
});
