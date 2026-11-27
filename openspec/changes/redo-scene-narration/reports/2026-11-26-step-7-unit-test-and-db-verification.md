# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-11-26
- Change: redo-scene-narration (JOS-282)
- Agent: Claude Code

## Commands Executed
- Targeted, each first failing then passing (TDD):
  - backend: `npx vitest run test/narration-takes-store.test.ts test/narration-take-fit.test.ts test/narration-take-audio.test.ts test/narration-take.test.ts test/narration-take-routes.test.ts test/voice-provider.test.ts test/narration-edits.test.ts`;
  - frontend: `npx vitest run test/narration-redo.test.tsx test/components.test.tsx`.
- Full suites with coverage: `npx vitest run --coverage` in `backend/` and in `frontend/`.
- `npm run typecheck` and `npm run lint` in both packages.
- Baseline: the same coverage runs on a temporary git worktree at the last commit (`76bdd45`). The worktree was removed afterwards.

## Unit Test Results
| Suite | Baseline (76bdd45) | This change |
|---|---|---|
| Backend tests | 3076 passed, 12 skipped | 3166 passed, 11 skipped, 0 failed |
| Frontend tests | 523 passed | 545 passed, 0 failed |

| Coverage | Backend baseline | Backend now | Frontend baseline | Frontend now |
|---|---|---|---|---|
| Statements | 95.90% | 96.16% | 97.57% | 97.57% |
| Branches | 93.52% | 93.55% | 90.12% | 90.39% |
| Functions | 97.37% | 97.45% | 89.10% | 90.03% |
| Lines | 95.90% | 96.16% | 97.57% | 97.57% |

Coverage did not drop. The first full run showed small drops in branches and functions; the gaps were real and were closed with tests:
- the take logger was not wired at boot (now `setNarrationTakeLogger(app.log)` in `bootstrap.ts`, with a test that logs carry ids, lengths and outcomes only);
- a take of a later scene alone;
- a reading that is too short;
- unreadable or mismatched timestamps;
- a throwing adapter;
- a take that is still generating;
- context with no whitespace;
- the handlers bound in `client.ts`.

Typecheck: passed in both packages. Lint: 0 errors. The frontend's 7 existing warnings are in files this change does not touch.

Existing tests updated (group 6):
- `session-api-surface` and `voice-over-session-read` allow the `narration-takes` routes as the second exception after the voice-over retry. A take never changes the voice-over or its timestamps, and its preview is an AAC excerpt, not the MP3.
- `persistence` lists `narrationTake.ts` and `narrationTakeAudio.ts` among the files whose `rmSync` calls remove temporary folders.
- The naming suite (`components.test.tsx`) has the new accessible names.

## Database State Verification
Application database `~/Library/Application Support/Vid4You/vid4you.sqlite`, read only:

| Indicator | Before | After |
|---|---|---|
| SHA-256 of `vid4you.sqlite` (first 16) | `e443e3adc170c400` | `e443e3adc170c400` |
| SHA-256 of `vid4you.sqlite-wal` (first 16) | `f7912631a8eb47ff` | `f7912631a8eb47ff` |
| Sessions (`runs`) | 8 | 8 |
| `voice_overs` | 8 | 8 |
| `narration_timestamps` | 8 | 8 |
| `narration_takes` table | absent (migration 28 not yet applied) | absent |
| Hash of all 16 `voice-over.mp3` and `narration-timestamps.json` files | `7e9a2536f6ef9781` | `7e9a2536f6ef9781` |

- State restored: not needed.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
