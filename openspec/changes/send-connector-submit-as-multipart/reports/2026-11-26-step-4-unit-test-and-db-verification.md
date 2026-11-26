# Step 4 Report - Unit Tests and Database Verification

- Date: 2026-11-26
- Change: send-connector-submit-as-multipart
- Agent: Claude Code

## Commands Executed
- `npx vitest run test/video-connector.test.ts` (before the implementation)
- `npx vitest run test/video-connector.test.ts test/video-connector-admin.test.ts test/adapter-contract.test.ts`
- `npm run typecheck`, `npm run lint`, `npx vitest run` (in `backend/`)

## Unit Test Results
- Before the implementation: 9 failed (the new behaviour), 61 passed
- Targeted: 288 passed, 0 failed
- Full backend suite: 3070 passed, 0 failed, 11 skipped (226 files passed, 5 skipped), 154 s
- Typecheck and lint: passed. The suite included the untracked comparison script test.
- Frontend tests: not run (no frontend change)

## Database State Verification
- Application database SHA-256 (first 16): `c98c7f1844443efe` before and after
- State restored: not needed

## Step 5 - curl on a throwaway backend (temporary data directory, throwaway password, port 3199)
| Request | Result |
|---|---|
| `POST /admin/provider-profiles`, body value is an object | 400, problem on `requests.submit.body` |
| `POST /admin/provider-profiles`, Viggle definition | 201, key not in the response, `multipartField` kept |
| `GET /admin/provider-profiles` | 200, lists "Viggle H3" / `viggle-h3` |
| `POST /admin/provider-profiles/:id/test` (live, free) | `connected` |
| `GET /admin/provider-profiles` without a password | 401 |

Server stopped and data directory deleted. Direct free calls to Viggle: credits 200 (balance 890); unknown video id 404 `RENDER_NOT_FOUND`.

## Live clip through the connector (paid, approved)
One 5 s clip (scene 34 image and instruction) with the documented definition, calling `createConfiguredVideoProvider` directly: check `connected`, submit accepted without a `seed`, poll `success`, download decoded cleanly. 1344x768, 24 fps, H.264 with AAC, 5.18 s. Balance 890 to 885 credits (USD 0.05).

## Not verified
- The clip did not run through the application's session pipeline or a packaged build, and the admin form was not tried in a browser.

## Outcome
- Step 4 status: PASS
- Blocking issues: none
