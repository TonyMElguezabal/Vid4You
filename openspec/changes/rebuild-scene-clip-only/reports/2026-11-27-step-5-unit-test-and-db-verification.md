# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-11-27
- Change: rebuild-scene-clip-only
- Agent: Claude Code (Opus 5.5)

## Commands Executed

- `npx vitest run test/scene-clip-rebuild-transition.test.ts test/scene-clip-rebuild-command.test.ts test/scene-rebuild` (backend, targeted)
- `npx vitest run test/scene-clip-rebuild.test.tsx test/scene-rebuild.test.tsx` (frontend, targeted)
- `npx vitest run`, `npm run typecheck`, `npm run lint` in `backend/` and in `frontend/`

## Unit Test Results

- **Backend, targeted:**
  - `scene-clip-rebuild-transition.test.ts` (new): 18 passed.
  - `scene-clip-rebuild-command.test.ts` (new): 14 passed. This includes the full rebuild with no `scope` and with `scope: "image-and-clip"` (task 1.3).
  - The existing `scene-rebuild-*` tests: 50 passed, unchanged.
- **Backend, full:** 3192 passed, 12 skipped, 0 failed (238 files), in 217 s. The flaky `provider-binding.test.ts` passed in this run.
- **Backend:** typecheck clean, lint clean.
- **Frontend, targeted:**
  - `scene-clip-rebuild.test.tsx` (new): 11 passed.
  - `scene-rebuild.test.tsx`: 33 passed, unchanged.
- **Frontend, full:** 565 passed. This includes the 4 new scene number tests of watch-scene-clips task 3.3, in `scene-clip-player.test.tsx`.
- **Frontend:** typecheck clean. Lint: 0 errors, and the same 7 `react-hooks/exhaustive-deps` warnings as before, all in files this change does not touch.
- **Existing tests (task 4.1):** none needed a change. The existing rebuild fixtures have no clip URL, so the form shows no choice there, as specified.

## Database State Verification

The tests use their own temporary database. This check covers the User's application database, read only.

| Table | Before | After |
|---|---|---|
| runs | 9 | 9 |
| scenes | 208 | 208 |
| voice_overs | 9 | 9 |
| narration_takes | 5 | 5 |
| stage_attempts | 55 | 55 |
| scenes with `rebuild_count > 0` | 18 | 18 |

- **State restored:** not needed; nothing changed. The User's app was assembling a final video during the run, and it wrote no new row in that time.

## Outcome

- **Step 5 status:** PASS
- **Blocking issues:** none
