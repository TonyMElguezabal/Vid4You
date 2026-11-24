## 0. Branch

- [x] 0.1 Create and switch to branch `feature/level-voice-over-volume` from `main` before any code change

## 1. Decision rule (TDD)

- [ ] 1.1 Save the measured per-second loudness of the four real MP3s (original, regeneration, stability 0.75, levelled) as small JSON fixtures under `backend/test/fixtures/`
- [ ] 1.2 Write failing unit tests for `needsLeveling(levels)` in `backend/test/voice-level.test.ts`: flat audio gives no leveling; one 8 dB dip gives leveling; a dip of exactly 6 dB gives none and 6.1 dB gives leveling; a quiet stretch shorter than one window gives none; silence is ignored and not counted as a dip; fewer than 3 measured windows gives none; a partial first or last window does not crash; the original, regeneration and stability fixtures give leveling
- [ ] 1.3 Implement `needsLeveling` in `backend/src/voiceLevel.ts` with the constants (window 10 s, minimum 4 speech seconds, silence −45 dBFS, trigger 6 dB, minimum 3 windows) and make the tests pass

## 2. Measuring and levelling

- [ ] 2.1 Write failing tests with generated audio (ffmpeg sine bursts with a controlled fade), skipped when the media tools are unavailable like the other media tests: a faded file is detected; a flat file is detected as clean and stored byte-identical; the levelled file keeps its length within one frame, stays under −1 dBFS and has a smaller deepest dip
- [ ] 2.2 Implement the measurement (one RMS value per second through `astats`) and `levelVoiceOver(audio)` (`dynaudnorm=f=300:g=51:m=20:p=0.9`, libmp3lame 128 kb/s) in `backend/src/voiceLevel.ts`, in a temp folder that is always removed, and make the tests pass
- [ ] 2.3 Write and pass the acceptance gate tests: not improved, clipped, length changed by more than one frame, the tool failing or missing; each keeps the provider's audio and logs a warning

## 3. Wiring

- [ ] 3.1 Write a failing test in the voice-over phase tests: a session whose audio has a dip stores the levelled MP3, records its measured duration, keeps the native timestamps unmodified and reaches `voice-over-complete`; a session whose levelling fails reaches `voice-over-complete` with the original MP3
- [ ] 3.2 Call the levelling step in `confirmVoiceOver` after the probe and before the write, recording the duration of the audio actually stored, and make the test pass
- [ ] 3.3 Confirm a retry or restart of assembly reuses the stored MP3 and does not level again, and that intervals and subtitles are unchanged for levelled audio

## 4. Verification

- [ ] 4.1 Review and update existing tests that assume the stored MP3 equals the provider's bytes; run the backend test suite and the type check
- [ ] 4.2 Real-file check: run the step on `voice-over-normalized.mp3` and the stability 0.75 file from `projectsruns/`, measure before and after, and record the numbers in `verification.md` in this change folder
- [ ] 4.3 Not applicable: no endpoint, database or UI is changed, so the curl, database-state and Playwright steps do not apply. Say so in the test report

## 5. Documentation

- [ ] 5.1 Update the technical documentation that describes the voice-over phase, and state the trigger, the acceptance gate and the never-fail rule
- [ ] 5.2 Run `graphify update .`
