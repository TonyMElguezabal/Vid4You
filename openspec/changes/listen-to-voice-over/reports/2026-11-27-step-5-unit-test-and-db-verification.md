# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-11-27
- Change: listen-to-voice-over
- Agent: Claude Code (Opus 5.5)

## Commands Executed

- `npx vitest run test/narration-audio.test.ts test/narration-take-routes.test.ts test/narration-take.test.ts test/voice-over-session-read.test.ts test/session-api-surface.test.ts test/api-spec-routes.test.ts` (backend, targeted)
- `npx vitest run test/voice-over-player.test.tsx test/scene-clip-player.test.tsx` (frontend, targeted)
- `npm test`, `npm run typecheck`, `npm run lint` in `backend/` and in `frontend/`

## Unit Test Results

- **Backend, targeted:**
  - `narration-audio.test.ts` (new): 6 passed.
  - `narration-take-routes.test.ts`: the session read now carries `audioUrl` (`?v=1`, then `?v=2` after a keep), and the route serves `audio/flac` after a keep.
  - The content-lock tests (`voice-over-session-read`, `session-api-surface`) allow exactly `/narration/audio` and still refuse any other route that names the voice-over or narration. The voice-over-session-read test also checks that the audio answers inline, with no `Content-Disposition`.
- **Backend, full:** 3174 passed, 11 skipped, 0 failed (233 files), in 202 s.
  - In an earlier full run, `provider-binding.test.ts` ("The default registries", 3 tests) failed once. This change does not touch that file or its code.
  - Run alone, it failed 1 time in 3, then passed 8 times in a row. It is a flaky test that predates this change.
- **Backend:** typecheck clean, lint clean.
- **Frontend, targeted:**
  - `voice-over-player.test.tsx` (new): 8 passed.
  - `scene-clip-player.test.tsx`: 13 passed, unchanged, after the player logic moved to `MediaPlayer`.
- **Frontend, full:** 558 passed (25 files).
- **Frontend:** typecheck clean. Lint: 0 errors, and 7 `react-hooks/exhaustive-deps` warnings, all in files this change does not touch.
- **Existing tests updated (task 4.1):** fixtures that build a `NarrationView` now include the required `audioUrl`, in:
  - `components.test.tsx`;
  - `narration-redo.test.tsx`;
  - `scene-rebuild.test.tsx`;
  - the backend `narration-take.test.ts`.

## Database State Verification

The tests use their own temporary database (`test/setup.ts`). This check covers the User's application database, `~/Library/Application Support/Vid4You/vid4you.sqlite`.

- **Pre-test baseline:**
  - runs: 9
  - scenes: 208
  - voice_overs: 9
  - narration_takes: 4
  - stage_attempts: 53
- **Post-test:**
  - runs: 9
  - scenes: 208
  - voice_overs: 9
  - narration_takes: 4
  - stage_attempts: 54
- **The one new row** is the User's running app (PID 55472, from `dist-package`) assembling one of their sessions. It is an `assembly` attempt queued at 18:19:58Z, while ffmpeg was running for it. The tests did not write it.
- **State restored:** not needed; the tests changed nothing in this database.

## Outcome

- **Step 5 status:** PASS
- **Blocking issues:** none. `provider-binding.test.ts` is flaky; this change didn't cause it, and it is noted for a later fix.
