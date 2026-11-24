## Why

With the provider default (`apply_text_normalization: "auto"`), ElevenLabs `eleven_multilingual_v2` misreads numbers in the script. A real run (11:21 of audio) read `$2,640` as "two thousand two hundred forty", `$3,342` as "$3,240", `$2,708` as "2,180", `$2,512.80` as "20-- 1280s", `$13,500` as "$1,350", `$1,776` as "one thousand seventy-six" and `$444` as "$404". The voice-over is wrong while the stored script is right, and a finished narration cannot be regenerated (PRD §4.2). A side-by-side test of 9 failing sentences read all 9 correctly with `apply_text_normalization: "on"`.

## What Changes

- Every ElevenLabs text-to-speech request asks the provider to normalise numbers, currency, percentages and ordinals by sending `apply_text_normalization: "on"`.
- The script text sent stays byte-identical to the stored script. Only the provider is asked to read it out loud in full words.
- The voice-over requirement and the test that pins the request body are updated to say so.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-over-generation`: the request sent to the voice provider must also ask the provider to normalise numbers when reading the script. The "script is sent unaltered" guarantee is unchanged.

## Impact

- Code: `backend/src/voiceProvider.ts` (request body of the `/with-timestamps` call).
- Tests: `backend/test/voice-provider.test.ts` (request body assertion).
- Docs: `docs/backend-standards.md` or the voice provider section that lists the request fields, if it names them.
- No change to the stored script, the alignment step (it aligns the original text with the audio), the API contract, the data model or the dependencies.
- Latency per request rises slightly because the provider rewrites the text first. The script is sent in one request, so this is paid once per session.
