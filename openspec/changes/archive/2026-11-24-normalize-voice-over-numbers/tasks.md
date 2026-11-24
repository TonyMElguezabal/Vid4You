## 0. Branch

- [x] 0.1 Create and switch to branch `feature/normalize-voice-over-numbers` before any code change

## 1. Request body (TDD)

- [x] 1.1 Update the request-body test in `backend/test/voice-provider.test.ts` so the expected body includes `apply_text_normalization: "on"`, and add a test that a script containing `$2,640`, `20%` and `7th` is sent with its text unchanged and the flag present. Run it and confirm it fails
- [x] 1.2 Add `apply_text_normalization: "on"` to the request body in `backend/src/voiceProvider.ts` and replace the comment above it so it no longer says "not normalised". Confirm the tests from 1.1 pass
- [x] 1.3 Fix the same stale comment in `backend/src/alignmentProvider.ts` ("not normalised") so it says only that the script is sent as stored, since the alignment request has no normalisation parameter

## 2. Verification

- [x] 2.1 Review and update the existing unit tests that assert the voice request body or the "unnormalised" wording, then run the backend test suite and the type check
- [x] 2.2 Manual check against the real provider: synthesise a short script containing the amounts `$2,640`, `$3,342`, `$2,708`, `$2,512.80`, `$13,500`, `$1,776` and `$444`, transcribe the MP3 with ElevenLabs speech-to-text, and confirm every amount is read correctly. Record the transcript in the change folder
- [x] 2.3 Not applicable: no endpoint, database or UI is changed, so the curl, database-state and Playwright steps do not apply. Say so in the test report

## 3. Documentation

- [x] 3.1 Update the technical documentation that lists the voice provider request fields, and check `docs/PRD.md` §4.2 and the §11 voice provider text for any wording that says the script is not normalised
- [x] 3.2 Run `graphify update .`
