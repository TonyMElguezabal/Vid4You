## Why

When the voice misreads something, for example a number, the User has no way to fix it. The voice-over is locked once it is stored. A new session costs a new voice-over and every image and clip again, and a new full voice-over would no longer match the scenes' timing. On 2026-11-26 this was fixed by hand for one session (JOS-282). Re-reading scenes 1 and 2 as one take, and joining it in a natural pause, gave a result the User could not tell from the original. Re-reading a single sentence on its own sounded cut. This change makes the working method a feature.

## What Changes

- The User can select one scene, or several consecutive scenes, and ask for their narration to be read again. The User first sees the text that will be read and its estimated cost, and must confirm.
- The selected scenes' text is sent as one request to the session's voice provider. It uses the same voice and settings, and the text around it is sent as context so the tone matches.
- The new reading (a "narration take") is split into its scenes. Each scene's speech starts exactly where it started before, and the length of the pause after it is adjusted. A speed change of at most 5% is used only when the pause alone cannot absorb the difference. The narration keeps its exact length, so no scene interval, clip duration or speed factor changes. The new reading is matched to the volume of the speech around it.
- A take that cannot fit is not used. The User is told which scene did not fit, and why.
- The User can listen to the redone section, with some narration before and after it, then keep or discard the take. A discarded take changes nothing.
- Keeping a take makes it part of the session's current narration. Pause changes on the redone scenes are reset. The final video is not rebuilt by itself: the User checks every scene, then clicks "Rebuild final video" for a version with the new narration and subtitles. The previous final video stays current until the new one succeeds. The same holds after a scene rebuild (JOS-235), which no longer rebuilds the final video by itself. A rebuild is refused while a take is generating or waiting for review.
- Nothing is overwritten. The original voice-over and its timestamps stay locked. Each take is stored as its own record and its own files, and the session shows which scenes have a redone narration.
- Narration take requests count as voice characters in the provider-usage and estimated-cost reports.
- **Exception to a locked rule:** the PRD states that the audio is not changed except by pause edits. A kept narration take is a second, explicit exception, and the voice provider may now be called again after the voice-over is complete, for a confirmed take only.

## Capabilities

### New Capabilities
- `scene-narration-redo`: redoing the narration of consecutive scenes as one take. Covers:
  - the quote and the confirmation;
  - the request;
  - fitting the take into the scenes' intervals and matching its volume;
  - review, keep and discard;
  - the current narration version and its history;
  - refusals, failures and restart;
  - the page's controls.

### Modified Capabilities
- `voice-over-generation`: "A session has at most one voice-over" no longer forbids every later voice request. A narration take that the User confirmed may call the voice provider. It never creates a second voice-over record or changes the stored MP3.
- `final-video-assembly`: the output's audio and the subtitles come from the session's current narration (the voice-over with its kept takes), not always from the original voice-over and its timestamps.
- `scene-pause-adjustment`:
  - pauses are derived from the current narration's timestamps;
  - keeping a take resets the pause edits of the redone scenes;
  - a kept take that the current final video predates is a reason to rebuild the final video;
  - a rebuild is refused with `take-in-progress` while a take is open, and starts only when the User asks for it.
- `scene-rebuild`: a rebuilt scene no longer rebuilds an existing final video by itself. The page says the final video predates the changes and offers "Rebuild final video" once every scene is complete. A session with no final video still assembles by itself.
- `admin-reports`: the provider-usage report counts narration take requests as voice attempts, billed by the characters re-read.

## Impact

- **Backend:**
  - New table `narration_takes` (a migration), with triggers that lock a decided take.
  - New module for quote, request, fit, keep and discard.
  - The voice adapter request gains optional `previousText` and `nextText`.
  - The assembly, pause and subtitle readers read the "current narration" instead of `voice_overs` and `narration_timestamps` directly.
  - The mux encodes the audio once (AAC), as the pause-edit path already does, when the narration is a spliced version.
  - The usage report SQL adds narration takes.
  - Boot marks interrupted takes as failed.
- **API:** new routes under `/sessions/{sessionId}/narration-takes`: quote, create, preview audio (with byte ranges), keep and discard. The session read gains the take state and a per-scene "narration redone" flag. `docs/api-spec.yml` is regenerated.
- **Frontend:**
  - a "Redo narration" action in a scene's details, with a "through scene" choice, the text and the cost;
  - a session-level review panel with an audio player and Keep and Discard;
  - a "Narration redone" badge on the scene.
- **Dependency:** the preview route reuses the byte-range handling added by `watch-scene-clips` (JOS-281, PR #9). That pull request must be merged first, or this branch starts from it.
- **Provider cost:** one voice request per take, billed per character. There are no automatic retries; every request is confirmed by the User.
- **Docs:**
  - `docs/PRD.md`, §7.3: the second exception to "the audio is not changed";
  - `docs/data-model.md`;
  - `docs/api-spec.yml`;
  - backend and frontend standards, where routes and names are listed.
