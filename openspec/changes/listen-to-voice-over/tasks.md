## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/listen-to-voice-over` from `feature/JOS-282-redo-scene-narration` (PR #10). Once PR #10 is merged, rebase it onto `origin/main`.

## 1. Backend: tests first

- [x] 1.1 Write failing tests for the session read. They cover:
  - `narration.audioUrl` is present as soon as the voice-over is stored, before any scene, and carries `?v=1`;
  - it changes to `?v=2` after a take is kept;
  - `narration` is absent while the voice-over is generating.
- [x] 1.2 Write failing tests for `GET /sessions/:sessionId/narration/audio`. They cover:
  - 200 with the whole MP3, `audio/mpeg`, `Accept-Ranges` and no attachment;
  - 206 for one range;
  - 416 past the end;
  - `audio/flac` with the kept take's file after a keep;
  - 404 for an unknown session, a session with no voice-over, and a missing file;
  - a path outside the project folder is refused.
- [x] 1.3 Update the content-lock tests (`voice-over-session-read`, `session-api-surface`) so they allow exactly the narration audio route by its path, and still refuse any other route that names the voice-over or narration (design Decision 6).

## 2. Backend: implementation

- [x] 2.1 Set `audioUrl` in `narrationReadModel` and add it to the `narration` response schema (design Decision 2).
- [x] 2.2 Add the narration audio route, using `resolveArtefactPath` and `sendFileWithRanges` (design Decision 1).
- [x] 2.3 Regenerate `docs/api-spec.yml`.

## 3. Frontend: tests first, then implementation

- [x] 3.1 Write failing component tests. They cover:
  - the Voice-over section shows the player exactly when `narration.audioUrl` is present, with `preload="none"`;
  - Play, Pause, resume, and Stop back to 0;
  - the button states, and the ended state;
  - the error sentence;
  - a new `audioUrl` remounts the player;
  - starting the voice-over pauses a playing clip, and the reverse.
- [x] 3.2 Extract `MediaPlayer` from `SceneClipPlayer` (design Decision 3). `SceneClipPlayer`'s existing tests must pass unchanged.
- [x] 3.3 Add `VoiceOverPlayer` and render it as the Voice-over phase's child in `SessionPage` (design Decisions 4 and 5). Add styles in `app.css` for both themes and a 375px width.

## 4. Review and update existing unit tests (MANDATORY)

- [x] 4.1 Update existing tests that assert the exact `narration` view or the Voice-over section's content, and keep the accessible-naming suite passing with the new names.

## 5. Run unit tests and verify database state (MANDATORY)

- [x] 5.1 Record the application database before the tests. Then run:
  - the targeted tests;
  - the full backend and frontend suites;
  - typecheck and lint.

  Compare the database afterwards.
- [x] 5.2 Write `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`.

## 6. Manual endpoint testing with curl and E2E (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Run a backend with a throwaway data directory and the stub providers. Then:
  - read the session right after the voice-over is stored;
  - curl the narration audio whole, with a range, past the end, and for an unknown session;
  - delete the directory.

  Write `reports/YYYY-MM-DD-step-6-curl.md`.
- [x] 6.2 Browser E2E: add a new test in the Playwright suite, `e2e/tests/voice-over-player.spec.ts`. It checks:
  - the player in the Voice-over section;
  - nothing loaded before Play;
  - Play, then Stop, with real playback;
  - the ended state.

  Also run it once in WebKit. Take screenshots in light and dark at 375 and 1440px, and write `reports/YYYY-MM-DD-step-6-e2e.md`.

## 7. Update technical documentation (MANDATORY)

- [x] 7.1 Add the player's accessible names to `docs/frontend-standards.md`. Note the route in `docs/backend-standards.md` if it lists the session routes. Run `graphify update .`.
- [x] 7.2 Add to `docs/PRD.md` §12.3 that the Voice-over player plays the narration inline, as the one exception to "the MP3 cannot be downloaded" (design Decision 6).
