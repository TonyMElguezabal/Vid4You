## MODIFIED Requirements

### Requirement: Each scene's pause is derived from locked data

The system SHALL derive the pause after each scene as the scene's narration-interval end minus the end of the last spoken character of the scene's `PROMPT`. It SHALL compute it from the timestamps of the session's current narration, with the same character matching segmentation uses. The current narration's timestamps are the stored narration timestamps, or those of the latest kept narration take (spec `scene-narration-redo`). The last scene's pause SHALL run to the voice-over's measured duration. The pause SHALL NOT be stored, and no stored interval, timestamp, voice-over or take SHALL be modified to compute or change it. A scene whose pause cannot be derived (no `PROMPT`, or timestamps that do not match the script) SHALL have no pause and SHALL NOT be editable.

#### Scenario: A pause between two scenes

- **GIVEN** scene 3 whose speech ends at 41.20 s and whose interval ends at 43.80 s (where scene 4's speech starts)
- **WHEN** the session is read after its final video exists
- **THEN** scene 3's original pause is 2.6 s

#### Scenario: The last scene

- **GIVEN** the last scene, whose speech ends 0.9 s before the voice-over's end
- **WHEN** the session is read
- **THEN** its original pause is 0.9 s

#### Scenario: A scene with no PROMPT

- **GIVEN** a scene registered without a `PROMPT`
- **WHEN** the session is read
- **THEN** that scene carries no pause and its pause cannot be set

#### Scenario: A scene whose narration was redone

- **GIVEN** a kept take in which scene 2's new speech ends 1.80 s before its interval ends
- **WHEN** the session is read
- **THEN** scene 2's original pause is 1.8 s

### Requirement: Rebuilding applies the edits in a new final-video version

The system SHALL accept a rebuild command only when all of these hold:
- the session has a final video;
- no assembly is running;
- every scene is `chunk-complete`;
- at least one of these is true:
  - the current edits differ from those the current final video was built with;
  - a scene was rebuilt after the current final video was built (`staleScenes`, spec `scene-rebuild`);
  - a narration take was kept after it was built (spec `scene-narration-redo`).

Otherwise it SHALL refuse with 409 and a reason, using `scenes-not-complete` while any scene is not `chunk-complete`.

Keeping a narration take SHALL remove the pause edits of the take's scenes. Their pauses are derived again from the take.

An accepted rebuild SHALL open a new assembly cycle using every scene's current clip and the session's current narration. In that cycle:
- each edited pause's silence is cut or inserted at the pause's midpoint;
- every later scene's interval is shifted by the accumulated change;
- clips are retimed to those shifted intervals.

On success it SHALL write a new file `final-video-<version>.mp4`, record the version with the edits it used, make it the current final video, and clear `staleScenes`. No earlier final-video file SHALL be replaced or deleted.

#### Scenario: A trimmed pause

- **GIVEN** a final video in which scene 3's pause is 2.6 s, edited to 1.1 s
- **WHEN** the User rebuilds and the rebuild succeeds
- **THEN** the new version is 1.5 s shorter, scene 4 and every later scene start 1.5 s earlier, and every scene still starts within ±1 frame of its shifted interval
- **AND** the project folder keeps `final-video.mp4` and gains `final-video-2.mp4`

#### Scenario: Nothing to rebuild

- **GIVEN** a final video built with exactly the current edits, with no scene rebuilt and no narration take kept since
- **WHEN** the User rebuilds
- **THEN** the command is refused with 409 `nothing-to-rebuild`

#### Scenario: A rebuilt scene makes the final video stale

- **GIVEN** a final video whose automatic rebuild after a scene rebuild failed
- **WHEN** the User rebuilds
- **THEN** the command is accepted even with no pause edits, and the new version uses the rebuilt scene's clip

#### Scenario: A kept narration take makes the final video stale

- **GIVEN** a final video whose automatic rebuild after a kept narration take failed
- **WHEN** the User rebuilds
- **THEN** the command is accepted even with no pause edits, and the new version uses the take's narration

#### Scenario: A kept take resets the redone scenes' pause edits

- **GIVEN** scenes 2 and 9 have pause edits
- **WHEN** the User keeps a narration take of scenes 1 and 2
- **THEN** scene 2 has no stored edit, and scene 9 keeps its edit

#### Scenario: A scene is still being rebuilt

- **GIVEN** a final video with pause edits pending, and scene 6 being rebuilt (`image-generating`)
- **WHEN** the User rebuilds the final video
- **THEN** the command is refused with 409 `scenes-not-complete` and no assembly starts

#### Scenario: A rebuild while one is running

- **WHEN** the User rebuilds, or sets a pause, while an assembly is running
- **THEN** it is refused with 409 `assembly-in-progress`

#### Scenario: A failed rebuild

- **WHEN** a rebuild fails after its retry budget
- **THEN** the previous final video stays the current one and stays downloadable
- **AND** the session is not shown as failed, and the read carries the rebuild's failure cause
- **AND** the User can rebuild again
