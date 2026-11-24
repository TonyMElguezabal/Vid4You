## Context

`confirmVoiceOver` (`backend/src/voiceOverPhase.ts`) probes the provider's audio with ffprobe, writes the MP3 once with `writeArtefactOnce`, and inserts the voice-over record. Everything after it (alignment, segmentation, intervals, assembly with the audio stream copied unchanged) reads that stored file. So a levelled file stored at this point reaches the final video without touching any later stage, and the "copied unchanged" assembly requirement stays literally true.

Evidence from one real session (10-second windows of speech loudness, dip = window below the median): the original MP3 had 4 windows more than 6 dB under (worst −7.3 dB), a regeneration had 10 (worst −12.3 dB), a regeneration with stability 0.75 had 10 (worst −12.3 dB). The dips move on every run, so they are drift inside one long generation, not a property of particular sentences. Levelling the regeneration with `dynaudnorm` cut its quiet windows from 10 to 1 (more than 6 dB) and its worst dip from −12.3 to −7.0 dB.

## Goals / Non-Goals

**Goals:**
- A voice-over with a clear drift is levelled before storage; a clean one is stored byte-identical.
- The decision is a pure function over loudness numbers, so its edge cases are unit-tested without audio.
- Duration and timestamps stay valid, with no change to assembly, intervals or subtitles.

**Non-Goals:**
- Fixing the cause (splitting the script into several requests with request stitching). That needs its own change because the spec forbids splitting the script.
- Making the trigger or the filter configurable.
- Judging absolute loudness or a uniformly quiet file.
- Making levelling perfect: one pass can leave a residual dip (the measured case kept one at −7.0 dB).

## Decisions

1. **Measure with ffmpeg `astats`, one RMS value per second.** The same ffmpeg the app already requires and probes; no new dependency. Seconds below −45 dBFS are silence and are ignored. A 10-second window needs at least 4 speech seconds to be measured; its level is the 75th percentile of its speech seconds (robust to a pause inside the window).
2. **Trigger: a window more than 6 dB below the median window level.** Chosen with the measured sessions: it catches all three bad files and ignores the 4–6 dB variation of normal delivery. A named constant, not a setting. The comparison is strictly greater than 6 dB.
3. **Level once with `dynaudnorm=f=300:g=51:m=20:p=0.9`, re-encoded with libmp3lame at 128 kb/s.** One pass only. A second pass would risk pumping and adds no guarantee.
4. **Accept the levelled file only if it improves, it is the same length, and it does not clip.** The gate is "deepest dip smaller", not "no dip left", because the measured result still had one 7 dB window; requiring zero dips would throw away a large improvement. Length tolerance is one frame (`1 / FINAL_OUTPUT.fps`); peak limit −1 dBFS.
5. **Never fail the session.** Any error, a missing tool, or a rejected result stores the provider's audio and logs a warning, using the existing logger of the phase. Levelling is a quality step, not a validity check; a failed session would cost a regeneration the user cannot repeat (PRD §4.2).
6. **No new record field.** The log line is enough for now. A `levelled` flag would need a migration and a data-model change; add it only if someone needs to see it in `/admin`.
7. **Work in a temp folder like `probeAudio` does.** Write the bytes to a temp file, run the tools, read the result, always remove the folder.
8. **A pure `needsLeveling(levels)` and a thin `levelVoiceOver(audio)`.** The first holds every rule above and is the unit-tested part; the second only shells out.

## Risks / Trade-offs

- **Residual dips.** One pass can leave a dip (7 dB in the measured case). Mitigation: the log line records the before and after worst dip; if residuals matter, the root-cause change comes next.
- **Re-encoding loses a little quality.** MP3 to MP3 at 128 kb/s is audible only on close listening. Accepted because it happens only when a clear dip exists.
- **Overall level rises.** Levelling raised the average from −26.7 to −22.2 dB in the measured case. Accepted; the peak limit prevents clipping.
- **Extra time per session.** One decode of the audio (seconds for 13 minutes), plus an encode when levelling applies.
- **The trigger is a judgement.** 6 dB comes from three measured files and listening. If real sessions show audible dips below it, lower the constant; the tests pin the boundary, so the change is deliberate.
