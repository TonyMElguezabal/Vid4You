# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-11-27
- Change: final-video-build-progress
- Agent: Claude Code (Opus 5.5)

## Commands Executed

- Backend, targeted: `npx vitest run test/assembly-progress.test.ts test/ffmpeg-async.test.ts test/assembly-progress-session.test.ts test/assembly-responsive.test.ts`, then the assembly, rebuild and take tests (`test/assembly* test/restart-assembly test/stub-assembly test/subtitle-assembly test/final-video test/scene-rebuild test/narration-take`).
- Frontend, targeted: `npx vitest run test/final-video-build-progress.test.tsx test/scene-rebuild.test.tsx`.
- `npx vitest run`, `npx tsc --noEmit` and lint, in `backend/` and in `frontend/`.

## Unit Test Results

- **Backend, new tests:**
  - `assembly-progress.test.ts`: 8 passed (task 1.2).
  - `ffmpeg-async.test.ts`: 4 passed, with the real ffmpeg (task 1.3). It also checks that the event loop keeps turning during a real assembly.
  - `assembly-progress-session.test.ts`: 7 passed (task 1.4).
  - `assembly-responsive.test.ts`: 1 passed (task 1.1). With the real ffmpeg tool, `POST …/final-video/rebuild` answers 202 and `GET /sessions/:id` answers in under 1 s, both before the assembly ends. Run against the old synchronous tool, the same test fails at "202 before the assembly ends".
- **Backend, existing assembly, rebuild and take tests:** 270, all passed after one fix. `stub-assembly-slow.test.ts` failed at first: with no clips, the `slow-success` stub spent only half its delay. The stub now spends the whole delay.
- **Backend, full:** 3180 passed, 12 skipped, 0 failed (240 files), in 216 s.
- **Backend:** typecheck clean, lint clean.
- **Frontend, new tests:** `final-video-build-progress.test.tsx`: 10 passed (task 3.1). 7 failed before the implementation; the 3 that passed guard behaviour that must not change.
- **Frontend, full:** 561 passed.
- **Frontend:** typecheck clean. Lint: 0 errors, and the same 7 `react-hooks/exhaustive-deps` warnings as before, in files this change does not touch.
- **Existing tests updated (task 4.1):**
  - `components.test.tsx`: the rebuild test now expects a disabled "Download final video" button and the new note. The session page rebuild test also expects the progress bar.
  - `scene-rebuild.test.tsx`: the `rebuilding` prop is now `building`.
  - No backend test compared the exact session read, and none relied on a synchronous `assemble()`.

## Database State Verification

The tests use their own database (`backend/data/skeleton.sqlite`). This check covers the User's application database, opened read only.

| Table | Before | After |
|---|---|---|
| runs | 9 | 9 |
| scenes | 208 | 208 |
| voice_overs | 9 | 9 |
| narration_takes | 7 | 7 |
| stage_attempts | 56 | 57 |
| scenes with `rebuild_count > 0` | 21 | 21 |
| final_video_builds | 10 | 10 |

- **The one new row:** an `assembly` attempt, `in-flight`, queued at 20:56:34 UTC. The only process that has the database open is the User's running app (PID 55472), so this is a final video build the User started during the test run. The tests never open this file.
- **State restored:** not needed; the tests changed nothing.

## Outcome

- **Step 5 status:** PASS
- **Blocking issues:** none
