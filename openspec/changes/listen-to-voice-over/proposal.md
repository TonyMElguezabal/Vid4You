## Why

A voice problem is only heard today in a scene clip or in the final video, after every image and clip has been paid for. Examples are a misread number, a wrong accent or a glitch. The voice-over is stored minutes before the scenes are built. If the User could listen to it then, they could stop and fix the session before the expensive stages run.

## What Changes

- Once the voice-over is stored, the Voice-over section shows a player with **Play**, **Pause** and **Stop** and no other control. This happens before decomposition and before any scene is built.
- The player plays the session's current narration: the voice-over, or the latest version with its kept narration takes (JOS-282). After a take is kept, the player plays the new version.
- Nothing is downloaded before Play. The audio is served inline with byte ranges, so the browser can seek and resume.
- One player plays at a time on the session page. Starting the voice-over pauses a scene clip that is playing, and starting a scene clip pauses the voice-over.
- The session read gives the narration's audio URL, so the page never builds a path itself.
- **Exception to a locked rule:** the PRD (§12.3) and `voice-over-generation` say that the MP3 cannot be downloaded from the app. That still holds: there is no download control and no attachment. Playing the narration inline in the Voice-over player is a stated exception, since the User cannot hear the voice-over any other way before the scenes are built.

## Capabilities

### New Capabilities
- `voice-over-playback`: listening to the session's current narration from the Voice-over section. Covers:
  - when the player is shown;
  - the audio route and its byte ranges;
  - the Play, Pause and Stop controls;
  - one player at a time;
  - a narration that cannot be played.

### Modified Capabilities
- `voice-over-generation`: "The session exposes the voice-over outcome" still forbids a download of the MP3, and now names inline playback by the Voice-over player as its one exception.

The scene clip player keeps its own requirements (watch-scene-clips, JOS-281). The rule that one media plays at a time across the voice-over and the clips is stated in the new capability.

## Impact

- **Backend:**
  - New route `GET /sessions/{sessionId}/narration/audio`. It serves the current narration inline: MP3 for the original, FLAC for a kept take. It reuses the byte-range helper of the clip and preview routes.
  - The session read's `narration` gains `audioUrl`.
- **Frontend:**
  - The clip player's Play, Pause and Stop logic is shared by the scene clip and the voice-over.
  - The Voice-over section renders the player when `narration.audioUrl` is present.
- **Dependency:** this builds on redo-scene-narration (JOS-282, PR #10): the current narration and the `narration` view in the session read. That pull request must be merged first, or this branch starts from it.
- **Docs:**
  - `docs/PRD.md` §12.3: the playback exception to "the MP3 cannot be downloaded";
  - `docs/api-spec.yml` (regenerated);
  - the frontend standards' list of accessible names.
- **Tests:** the content-lock tests that list the routes allowed to name the narration add this route.
- **Provider cost:** none. Only the stored file is played.
