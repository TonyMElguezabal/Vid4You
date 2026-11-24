# Real-file check: `levelIfNeeded` on voice-overs that faded

Run through the implemented `levelIfNeeded` with the real ffmpeg tools (filter `dynaudnorm=f=1500:g=15:m=20:p=0.85:b=1`, MP3 128 kb/s), on three real ElevenLabs voice-overs of the same script. "Dip" is the deepest 10-second window under the median window; "gain step" is the largest change of the applied gain between two consecutive seconds of speech.

| File | Levelled | Dip before → after | Max gain step | Peak | Duration before → after |
|---|---|---|---|---|---|
| `voice-over.mp3` (original session) | yes | 7.3 → 3.7 dB | 0.41 dB/s | −1.8 dBFS | 681.599 → 681.599 s |
| `voice-over-normalized.mp3` (regeneration) | yes | 12.7 → 7.3 dB | 0.91 dB/s | −1.8 dBFS | 816.599 → 816.599 s |
| `voice-over-stability075.mp3` (stability 0.75) | yes | 12.4 → 6.8 dB | 1.00 dB/s | −1.8 dBFS | 829.231 → 829.231 s |

- Every limit of the acceptance gate held: the deepest dip got smaller, the length is identical, no peak above −1 dBFS, and the gain never changed by more than 2 dB between consecutive seconds (the first filter setting, `f=300:g=51`, reached 2.8 dB/s and sounded like a sudden boost).
- One pass leaves a residual dip on the two worse files (7.3 and 6.8 dB, still over the 6 dB trigger). This is the known limit named in the design; the root-cause fix is splitting the script into several requests, a separate change.
- A sample of the first file's regeneration, levelled and re-muxed into the video, was listened to by the requester before the setting was chosen.
- The filter's target peak was moved from `p=0.9` to `p=0.85` after the first gate test: 0.9 is about −0.9 dBFS, above the −1 dBFS limit, so a clean signal could be rejected as clipping. On the regeneration the two give the same dip (7.33 dB) and gain step (0.89 and 0.91 dB/s).
- Single run per file; ffmpeg's MP3 encode is deterministic for the same input.
