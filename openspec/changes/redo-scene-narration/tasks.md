## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/JOS-282-redo-scene-narration`, from `origin/main` once PR #9 (watch-scene-clips) is merged, otherwise from `feature/JOS-281-watch-scene-clips`, rebasing onto `main` after the merge (design Risks)
- [x] 0.2 Verify the branch and a clean working tree for the files this change touches; switch `.claude/settings.json` back to Sonnet for coding (CLAUDE.md §5)

## 1. Backend: data model (tests first)

- [x] 1.1 Failing tests for the `narration_takes` migration:
  - the columns of design Decision 8;
  - `number` unique per run;
  - the partial unique index allowing one generating or ready take per run;
  - triggers refusing delete, and refusing any update of a kept or discarded row;
  - existing databases migrate with no rows
- [x] 1.2 Add the migration and the store functions:
  - insert a take;
  - set it ready or failed;
  - keep or discard it;
  - list a run's takes, and get one take;
  - `currentNarration(runId)` (design Decision 2), with version = 1 + kept takes
- [x] 1.3 Failing tests, then the boot step: a `generating` take becomes `failed` with the restart cause and is never sent again (design Decision 11)

## 2. Backend: fit and splice (pure functions first)

- [x] 2.1 Export `locateFragment` from `scenePause.ts`. Write failing tests for `planTakeFit`, covering:
  - speed 1.0 when the pause absorbs the difference (the 13.54 s / 11.74 s → 1.80 s scenario);
  - the least speed-up to keep a 0.2 s pause;
  - too long beyond 5%, with the amount at normal speed;
  - too short beyond 5% against `max(3.0, original pause)`;
  - several scenes, each starting at its interval's start;
  - the last scene of the session;
  - a take with less than 50 ms of leading silence
- [x] 2.2 Implement `planTakeFit` with the named constants of design Decision 14
- [x] 2.3 Failing tests for the filtergraph builder, then implement it:
  - base before, parts and base after, with 10 ms fades;
  - `atempo` only where the speed changes;
  - pause changes at the middle;
  - exact sample totals
- [x] 2.4 Failing tests for the spliced timestamps, then implement them:
  - base characters before and after are unchanged;
  - take characters are moved by placement, speed and pause changes;
  - the result passes `checkTimestamps` with the original mechanism's matching;
  - an alignment-mechanism session (whitespace-insensitive) works too
- [x] 2.5 Failing tests with real ffmpeg on generated tones and silence, then implement the splice runner:
  - the FLAC has exactly the base's decoded sample count;
  - it is sample-identical outside the section;
  - the gain matches the RMS levels, limited to ±6 dB, with peaks at or below −1 dBFS;
  - the preview is AAC/M4A from 3 s before to 3 s after, cut at the ends

## 3. Backend: quote, take request, keep and discard

- [x] 3.1 Failing tests for the quote:
  - the text spans the selected `PROMPT`s;
  - characters and cost from the bound profile's price, with none when unpriced;
  - the scenes whose pause edits would be reset;
  - `unknown-scene` 404, `invalid-range` 422, `too-long` 422, `narration-not-located` 409;
  - no provider call
- [x] 3.2 Add `previousText` and `nextText` to `VoiceSynthesisRequest`, and send them as `previous_text` and `next_text` in the ElevenLabs adapter (adapter test)
- [x] 3.3 Make the stub adapter answer a request with context with silent audio and timestamps over its first 75% (design Decision 6). Export `voiceParametersFor`
- [x] 3.4 Failing tests for creating a take:
  - recorded before sending;
  - 202 with the id;
  - one request with the text, context, language and bound profile parameters;
  - holds a voice concurrency slot;
  - the voice time limit, with a late answer dropped;
  - no automatic retry;
  - `take-in-progress` and `assembly-in-progress` 409, including two back-to-back calls;
  - a missing credential fails without a call;
  - the voice-over record, MP3 and timestamps unchanged
- [x] 3.5 Implement the take module (`narrationTake.ts`) end to end:
  - provider call;
  - timestamp check: missing, or not reproducing the text, means not usable;
  - fit, then splice;
  - files written with `writeArtefactOnce`;
  - ready or failed, with a readable cause and no credentials;
  - logs with ids, lengths and outcomes only;
  - broadcast
- [x] 3.6 Failing tests for keep and discard, then implement them:
  - keep is atomic: kept, the redone scenes' pause edits removed, `final_video_stale` set when a final video exists;
  - the automatic rebuild starts when every scene is complete, waits for a rebuilding scene, and is held while paused;
  - `take-not-ready`, `take-not-open`, `unknown-take` and `assembly-in-progress`;
  - discard of a ready or failed take changes nothing else;
  - a second take is built on version 2

## 4. Backend: readers, assembly, reports, routes

- [x] 4.1 Failing tests, then switch `loadSessionPauses` and `buildAssemblySubtitles` to `currentNarration`: a redone scene's pause and subtitle times follow the take, and every other scene's are unchanged
- [x] 4.2 Failing tests, then the assembly:
  - it muxes the current narration;
  - `AssemblyInput.encodeNarration` takes the encode-once path, with measurement, for a spliced narration;
  - the original MP3 with no edits is still copied (ADR 0005, Decision 4b);
  - `rebuildFinalVideo` accepts a stale final video after a kept take
- [x] 4.3 Failing tests, then add takes to `readCountedAttempts`:
  - voice attempts of their provider;
  - billed `text_length` on a provider success, even when the fit failed;
  - not counted while generating, or when never sent;
  - the 13,000 + 283 characters scenario
- [x] 4.4 Extract `sendFileWithRanges` from the clip route (its tests stay green). Write failing route tests, then add the five routes with Zod schemas:
  - quote, create, preview (200/206/416, inline, scoped to the session), keep and discard;
  - the session read's `narration` and the per-scene `narrationRedone` and `narrationRedoable`
- [x] 4.5 Regenerate `docs/api-spec.yml` from `app.swagger()` and keep the drift test green

## 5. Frontend (tests first)

- [x] 5.1 Failing tests for the API client and types: quote, create, keep and discard calls; `narration` and the per-scene flags in the session payload
- [x] 5.2 Failing component tests for Redo narration in `SceneRow`:
  - shown only when the scene can be redone, no take is open and the session is not assembling;
  - the "Through scene" choice starts at this scene;
  - the quote's text, characters, cost or "price not set", and the pause-reset list;
  - the billed and rebuild sentences;
  - confirm and cancel;
  - refusals shown as sentences;
  - keyboard use and names
- [x] 5.3 Failing component tests for `NarrationTakePanel`:
  - while generating, the scene range;
  - while ready, an audio player with `preload="none"` plus Keep new narration and Discard;
  - when failed, the cause and Dismiss;
  - hidden when there is no open take;
  - live updates
- [x] 5.4 Implement the form, the panel, the "Narration redone" badge and the styles: both themes, 375 px width with no horizontal scroll

## 6. Review and update existing unit tests (MANDATORY)

- [x] 6.1 Update the tests that assume:
  - the assembly always copies the voice-over;
  - pauses and subtitles read only `narration_timestamps`;
  - the session payload has no `narration`;
  - the usage report counts only `stage_attempts`.

  Add the new accessible names to the naming suite.

## 7. Run unit tests and verify database state (MANDATORY)

- [x] 7.1 Record the application database's indicators before the tests: session count, `voice_overs`, `narration_timestamps` and `narration_takes` counts, and file hashes. Then run:
  - the targeted tests;
  - the full backend and frontend suites with coverage (coverage must not drop);
  - typecheck and lint.

  Compare the indicators afterwards and restore if anything changed.
- [x] 7.2 Write `reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` with the commands, results, before/after comparison and any restoration

## 8. Manual endpoint testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start a backend with a throwaway data directory and the stub providers, and run a short session to its final video
- [x] 8.2 curl the quote: valid, wrong order, too long, unknown scene, another session's scene
- [x] 8.3 curl create, then:
  - poll the session read until the take is ready;
  - curl the preview whole, with each range form, and past the end;
  - curl create again for `take-in-progress`
- [x] 8.4 curl discard, then a new take and keep:
  - check the narration version, the redone scenes, the removed pause edit, and the automatic rebuild to `final-video-2.mp4`;
  - check that `voice-over.mp3` and `narration-timestamps.json` are unchanged (hashes);
  - curl keep again for `take-not-open`
- [x] 8.5 Restart the backend during a hanging stub take, and check that it is failed with the restart cause and not resent. Delete the throwaway directory and record all commands and answers in `reports/YYYY-MM-DD-step-8-curl.md`

## 9. E2E testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Add `e2e/tests/narration-redo.spec.ts` to the project's Playwright suite (runs in CI) on the stubbed backend:
  - run a session to its final video;
  - open Redo narration on scene 1, see the text and cost, and confirm;
  - wait for the review panel, then play the preview with real playback;
  - Keep, then see "Narration redone" and the rebuilt final video;
  - a second take, then Discard, changes nothing
- [x] 9.2 Run the spec once in WebKit with a local config. Take screenshots in light and dark at 375 and 1440 px, and record them in `reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update technical documentation (MANDATORY)

- [x] 10.1 `docs/PRD.md` §7.3: add a kept narration take as the second exception to "the audio is not changed", with JOS-282
- [x] 10.2 `docs/data-model.md`: add `narration_takes` and the current-narration rule. `docs/backend-standards.md` and `docs/frontend-standards.md`: add the routes and the accessible names where they are listed
- [x] 10.3 Run `openspec validate redo-scene-narration --strict` and `graphify update .`
