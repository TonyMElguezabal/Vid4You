## Why

ElevenLabs generates the whole script in one request, and in a real session (11–14 minutes of speech) the voice repeatedly fades and later snaps back: stretches of 10 to 60 seconds are 6 to 12 dB quieter than the rest. The dips land in different places on every regeneration of the same script, and a higher stability setting did not remove them (measured, windows more than 4 dB under the median: 10 for the original, 13 for a regeneration, 21 for a stability 0.75 regeneration). The voice-over cannot be regenerated within a session (PRD §4.2), so the fade reaches the final video.

## What Changes

- After the provider returns the MP3 and before it is stored, the system measures the loudness of the speech in 10-second windows.
- If any window is more than 6 dB quieter than the median window, the system levels the audio once (volume levelling filter with slow gain changes, re-encoded as MP3 at the same bit rate) and re-measures it.
- The levelled file replaces the provider's file only if it is better (its worst dip is smaller), has the same duration within one frame, does not clip, and is smooth (the applied gain never jumps by more than 2 dB between consecutive seconds, so a fade is recovered gradually instead of with a sudden boost). Otherwise the provider's file is stored untouched.
- A file with no such dip is stored byte-identical to what the provider returned.
- A problem in this step never fails the session: the original audio is stored and a warning is logged.
- No change to timestamps, intervals, subtitles or assembly: the stored MP3 is still the one the assembly copies unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-over-generation`: a new requirement, "A voice-over whose volume drifts is levelled before it is stored". The existing requirements (exactly one MP3, native timestamps kept, script sent unaltered) are unchanged.

## Impact

- Code: `backend/src/voiceOverPhase.ts` (`confirmVoiceOver`, between the probe and the write) and a new `backend/src/voiceLevel.ts` (measurement, decision, levelling).
- Tests: new `backend/test/voice-level.test.ts` with measured loudness fixtures; one case in the voice-over phase tests.
- Dependencies: none. It uses the ffmpeg and ffprobe the app already requires.
- Runtime: one extra decode of the audio per session (a few seconds for 13 minutes), plus one encode when levelling applies.
- Not covered: a voice that is uniformly quiet (not a drift), and the root-cause fix of splitting the script into several requests, which would be a separate change.
