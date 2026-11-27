## Context

The voice-over is stored as one leveled MP3 (`voice_overs.audio_path`) before decomposition starts. Decomposition, images and clips follow, and they cost the most. Today the User first hears the voice in a scene clip's card (no narration, only the clip) or in the final video.

redo-scene-narration (JOS-282) added:
- `currentNarration(runId)`: the original MP3, or the latest kept take's FLAC with `spliced: true`;
- the session read's `narration` view, built by `narrationReadModel` and present once the voice-over is stored;
- `sendFileWithRanges`, the byte-range sender shared by the clip and take preview routes.

watch-scene-clips (JOS-281) added `SceneClipPlayer`: Play, Pause and Stop over a `<video>` with no native controls, `preload="none"`, and a module-level "playing clip" so only one clip plays.

## Goals / Non-Goals

**Goals:**
- hear the voice-over from the Voice-over section as soon as it is stored;
- Play, Pause and Stop, as the scene clips;
- one player at a time across the voice-over and the clips;
- always the current narration.

**Non-Goals:**
- A timeline, seek bar, volume or speed control. The User asked for Play, Pause and Stop.
- Playing with the pause edits applied. Those exist only in the assembled final video.
- Downloading the voice-over.
- Stopping the pipeline from the player. Pause session already exists.

## Decisions

1. **One route, `GET /sessions/:sessionId/narration/audio`, serving `currentNarration(runId).audioPath`.** It sends `audio/mpeg` for the original and `audio/flac` when `spliced` is true. It uses `resolveArtefactPath` and `sendFileWithRanges` as the preview route does.
   - Alternative: a route that always serves the original MP3. Rejected: after a kept take, the player would play the misreading the User fixed.
   - Alternative: encode the FLAC to AAC for playback. Rejected: an extra file and an ffmpeg step. Chrome, Firefox and Safari (macOS 11+) play FLAC in `<audio>`.
2. **`narration.audioUrl` is `/sessions/{id}/narration/audio?v={version}`, set in `narrationReadModel`.** The version query changes the URL when a take is kept. The browser does not reuse the cached old file, and the page remounts the player with `key={audioUrl}`. The route ignores the query and always serves the current version. A stale `?v=1` after a keep plays the new narration, which is the one the User wants.
3. **The clip player's logic becomes a shared `MediaPlayer`.** It takes the element kind (`video` or `audio`), the accessible name ("scene 3 clip" or "voice-over") and the failure sentence. It keeps:
   - the module-level "playing media", widened from `HTMLVideoElement` to `HTMLMediaElement`. This gives one player at a time across clips and the voice-over, with no new code;
   - the button states driven by the element's events;
   - the AbortError handling.

   `SceneClipPlayer` renders `MediaPlayer` with its existing labels, so its tests and the e2e test stay unchanged. `VoiceOverPlayer` renders it with `kind="audio"`.
   - Alternative: a second, copied component for audio. Rejected because it repeats about 80 lines and needs a second "playing" variable that the two would have to share anyway.
   - Alternative: native `<audio controls>`, as the take preview uses. Rejected: the User asked for Play, Pause and Stop. Native controls add a timeline and volume, and they would not pause a playing clip.
4. **The player is rendered in `SessionPage` as the Voice-over phase's child, when `session.narration?.audioUrl` is present.** This is the same pattern as the scenes and assembly phases. `PhaseSection` itself is unchanged.
5. **Labels:** the group is "Voice-over player". The buttons are "Play voice-over", "Pause voice-over" and "Stop voice-over", each showing the word Play, Pause or Stop. The failure sentence is "The voice-over could not be played.", shown in a `role="status"`. These follow the clip player's pattern.

6. **Playback is an exception to "the MP3 cannot be downloaded" (PRD §12.3), not a download.** The route answers inline, with no `Content-Disposition: attachment`, and the page shows no download control. A person who opens the URL by hand can still save the file. The app is local and single-user, and the file already sits in the User's project folder, so this exposes nothing new. The content-lock tests (`voice-over-session-read`, `session-api-surface`) keep failing for any other route that names the narration. They allow this one route by its exact path.
   - Alternative: serve only a lower-quality copy or an excerpt, as the take preview does. Rejected: the purpose is to hear the whole voice-over as it will sound.

## Risks / Trade-offs

- [A kept take's FLAC is large: about 2 MB per minute of mono at 44.1 kHz] → `preload="none"`, and byte ranges let the browser stream it. Nothing loads before Play.
- [A take is kept while the voice-over plays] → the next session read gives a new `audioUrl`. The player remounts, stops and starts over from the new version. This is acceptable, since the User has just changed the narration.
- [jsdom does not play media] → as for the clips: component tests stub `play` and `pause` and fire the media events. Real playback is checked in Chromium and WebKit with Playwright (task 6).
- [The stub voice provider gives 1 s of audio] → enough for Play, Stop and the ended state in the browser test. Pause and resume are covered by component tests.

## Migration Plan

No data change, and no migration. An installed app needs a new build. Rollback means removing the route and the player, which leaves no stored state behind.

## Open Questions

None.
