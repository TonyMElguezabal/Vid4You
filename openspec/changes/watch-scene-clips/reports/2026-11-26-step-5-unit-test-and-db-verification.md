# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-11-26
- Change: watch-scene-clips (JOS-281)
- Agent: Claude Code

## Commands Executed
- `npx vitest run test/scene-clip-route.test.ts` (in `backend/`, before the implementation: 12 failed, 3 passed)
- `npx vitest run test/scene-clip-player.test.tsx` (in `frontend/`, before the implementation: 11 failed, 1 passed)
- Targeted: `backend/` scene-clip-route, scene-image-route, scene-rebuild-files, scene-download, api-spec-routes; `frontend/` scene-clip-player, components
- `npm run typecheck`, `npx eslint . --ignore-pattern coverage`, `npx vitest run --coverage` (in `backend/`)
- `npx tsc --noEmit -p .`, `npx eslint src test`, `npx vitest run --coverage` (in `frontend/`)
- `npx tsc --noEmit`, `npx playwright test` (in `e2e/`)

## Unit Test Results
- Backend, full suite: 3085 passed, 0 failed, 11 skipped (227 files passed, 5 skipped), 155 s; run again after the last route fix with the same result. Coverage 95.9% statements and lines (floor 94%).
- Frontend, full suite: 523 passed, 0 failed (23 files). Coverage 97.57% statements and lines.
- Typecheck: passed in backend, frontend and e2e.
- Lint: passed. The backend's `coverage/` folder (git-ignored output of `--coverage`) is excluded from the lint run; it is not a source folder. The frontend's 7 existing `react-hooks/exhaustive-deps` warnings are unchanged.
- Browser tests (Playwright, Chromium): 2 passed (the existing main flow and the new `scene-clips.spec.ts`).

## Database State Verification
The installed app was running a session during the tests, so the whole-file hash would change for reasons unrelated to the tests. Stable indicators were compared instead (read-only):

| Indicator | Before | After |
|---|---|---|
| Sessions | 8 | 8 |
| SHA-256 of the session ids (first 16) | `12512dd9cad3b2c8` | `12512dd9cad3b2c8` |
| Scenes of the other sessions | 76 | 76 |
| Sessions with a test title | 0 | 0 |
| Provider profiles (SHA-256 of id, label, updated_at) | `097ea13eabbbfe5d` | `097ea13eabbbfe5d` |
| Active providers (SHA-256) | `d87da6b45eb6bfcb` | `d87da6b45eb6bfcb` |
| Clips done in the running session | 62 | 62 |

The tests use their own database (`backend/data/skeleton.sqlite`, reset by the suite), never the app's.

- State restored: not needed

## Step 6 - curl on a throwaway backend (stub providers, temporary data directory, port 3198)
A stubbed session stored one clip (2338 bytes). `result.videoUrl` was `/sessions/{id}/scenes/{sceneId}/clip`.

| Request | Result |
|---|---|
| No `Range` | 200, `video/mp4`, `Accept-Ranges: bytes`, `Content-Length: 2338`, no `Content-Disposition` |
| `bytes=0-99` | 206, `Content-Range: bytes 0-99/2338`, 100 bytes, identical to the file's first 100 |
| `bytes=100-` | 206, `bytes 100-2337/2338` |
| `bytes=-50` | 206, `bytes 2288-2337/2338` |
| `bytes=2338-` | 416, `Content-Range: bytes */2338` |
| `bytes=0-9,20-29` | 200, whole file |
| Unknown scene; the scene under another session | 404, 404 |
| `POST` on the route | 404 |

Server stopped and data directory deleted.

## Step 6 - Browser E2E
- Playwright MCP was not used; the project's Playwright suite (`e2e/`) was, with a new test `e2e/tests/scene-clips.spec.ts`. It runs in CI with the main flow.
- Checked with real playback: the player is on the collapsed card; `preload="none"` and no clip request before Play; Play plays; Pause keeps the position (unchanged 0.5 s later); Play resumes from it; Stop returns to 0 and disables itself; no error message.
- The same test passed in WebKit (Safari's engine, Playwright 27.2) with a local-only config, not committed.
- Not checked in a browser: "one clip at a time" and two quick Plays. The stub voice always gives 1 s of audio, so a stubbed session has one scene. Both are covered by component tests.
- Screenshots (light and dark, 375 and 1440 px), collapsed and expanded, on the stubbed backend: no horizontal scroll at either width. At 375 px the three buttons first wrapped to two lines; their padding was reduced and they now fit on one. The stub image is not a viewable picture, so the poster and expanded image are blank in these screenshots, as they are without this change.

## Outcome
- Step 5 status: PASS
- Blocking issues: none
