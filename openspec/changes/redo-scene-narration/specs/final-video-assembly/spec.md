## MODIFIED Requirements

### Requirement: The output's only audio is the complete voice-over

The system SHALL discard each clip's own audio track. The final video's audio SHALL be the session's complete current narration and nothing else:
- the voice-over, when no narration take was kept;
- otherwise the narration of the latest kept take (spec `scene-narration-redo`).

The original voice-over is muxed as stored. A kept take's narration is encoded once, as an edited narration is, and the output SHALL be measured: audio and video must agree within one frame, or the attempt fails.

#### Scenario: A clip carries its own sound

- **WHEN** a chunk's clip has its own audio track
- **THEN** that track is discarded
- **AND** it does not appear in the final video's audio

#### Scenario: The final video is inspected

- **WHEN** the final video's audio track is inspected
- **THEN** it is the session's complete current narration

#### Scenario: A build after a kept take

- **GIVEN** a session with a kept take of scenes 1 and 2
- **WHEN** its final video is built
- **THEN** its audio is the take's narration, encoded once, and the audio and video lengths agree within one frame

### Requirement: The subtitles follow the narration after pause edits

The subtitles SHALL be built from the timestamps of the session's current narration: the stored narration timestamps, or those of the latest kept take. When a final-video build applies the User's pause edits, the system SHALL move every subtitle time by the same amounts as the narration:
- a time after an inserted silence SHALL move later by its length;
- a time after a removed silence SHALL move earlier by its length;
- a time inside a removed silence SHALL move to where the removal begins.

A build with no edits SHALL use the current narration's timestamps unchanged.

#### Scenario: A pause is lengthened

- **WHEN** a rebuild lengthens the pause after a scene by 0.5 s
- **THEN** every subtitle time after that pause is 0.5 s later than in the previous build

#### Scenario: A pause is shortened

- **WHEN** a rebuild shortens a pause by 0.4 s
- **THEN** every subtitle time after that pause is 0.4 s earlier than in the previous build

#### Scenario: A build without edits

- **WHEN** a final video is assembled with no pause edits
- **THEN** the subtitle times are those of the current narration's timestamps

#### Scenario: A build after a kept take

- **WHEN** a final video is assembled after a take of scene 2 was kept
- **THEN** the subtitle times of scene 2 are the take's, and every other subtitle time is unchanged
