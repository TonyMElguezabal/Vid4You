## MODIFIED Requirements

### Requirement: The Voice-over section plays the narration with Play, Pause and Stop

When the session read carries `narration.audioUrl`, the Voice-over section SHALL show a player named "Voice-over player" with one Play/Pause button and one Stop button, and no other control. Each button SHALL show an icon, with its action as a tooltip. This holds whatever the later phases are doing, including before decomposition and while scenes are built. Nothing SHALL be downloaded before Play.

The Play/Pause button SHALL be named `Play voice-over` while the narration does not play and `Pause voice-over` while it plays, and SHALL do what its name says. Play starts or resumes the narration. Pause keeps the position. `Stop voice-over` SHALL be present only while the narration plays or is away from its start; it pauses the narration and returns to the start. When the narration ends, the player returns to the not-playing state. When the version changes, the player is replaced and starts from the beginning, not playing.

#### Scenario: Shown once the voice-over is stored

- **GIVEN** a session whose voice-over is stored and whose scenes are not built
- **WHEN** the User opens the session
- **THEN** the Voice-over section shows `Play voice-over` and no `Stop voice-over`, and no narration audio has been requested

#### Scenario: Not shown before the voice-over

- **GIVEN** a session whose voice-over is generating
- **WHEN** the User opens the session
- **THEN** the Voice-over section shows no player

#### Scenario: Play, Pause, Stop

- **GIVEN** the voice-over player in the Voice-over section
- **WHEN** the User clicks `Play voice-over`
- **THEN** the narration starts, the button is named `Pause voice-over`, and `Stop voice-over` is shown
- **AND** after `Pause voice-over` and `Play voice-over`, the narration resumes from where it was paused
- **AND** after `Stop voice-over`, the narration is at the start, the button is named `Play voice-over`, and `Stop voice-over` is no longer shown
