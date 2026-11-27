## ADDED Requirements

### Requirement: The session's current narration is served inline, scoped to its session, with byte ranges

`GET /sessions/:sessionId/narration/audio` SHALL return the session's current narration inline with `Accept-Ranges: bytes`. It is the stored voice-over (`audio/mpeg`) while no narration take is kept, and the latest kept take's narration (`audio/flac`) after one is. Byte ranges SHALL be answered exactly as the scene clip route answers them: 206 with `Content-Range` for one range, 416 with `Content-Range: bytes */{size}` for a range starting at or past the end, and 200 with the whole file for any other `Range` header. The route SHALL answer 404 when the session does not exist, has no stored voice-over yet, or the file is missing. A stored path that resolves outside the session's project folder SHALL be refused and never read. The route SHALL accept no body, change nothing and call no provider.

#### Scenario: The voice-over before any scene is built

- **GIVEN** a session whose voice-over is stored and whose decomposition has not finished
- **WHEN** its narration audio is requested without a `Range` header
- **THEN** the response is 200, `audio/mpeg`, `Accept-Ranges: bytes`, with no `Content-Disposition: attachment`, and the stored MP3's exact bytes

#### Scenario: A byte range

- **GIVEN** a session whose stored voice-over is 1,000 bytes
- **WHEN** its narration audio is requested with `Range: bytes=100-199`
- **THEN** the response is 206, `Content-Range: bytes 100-199/1000`, `Content-Length: 100`, with bytes 100 to 199 of the file

#### Scenario: A range past the end

- **GIVEN** a session whose stored voice-over is 1,000 bytes
- **WHEN** its narration audio is requested with `Range: bytes=1000-`
- **THEN** the response is 416 with `Content-Range: bytes */1000`

#### Scenario: After a narration take is kept

- **GIVEN** a session with a kept narration take
- **WHEN** its narration audio is requested
- **THEN** the response is 200, `audio/flac`, with the kept take's narration file, not the original MP3

#### Scenario: No voice-over yet

- **GIVEN** a session whose voice-over is still generating, or has failed
- **WHEN** its narration audio is requested
- **THEN** the response is 404

#### Scenario: Another session's id

- **GIVEN** an unknown session id
- **WHEN** its narration audio is requested
- **THEN** the response is 404 and no file is read

### Requirement: The session read points at the narration's audio

The session read's `narration` SHALL carry `audioUrl`, the narration audio route for that session. The URL SHALL change when the narration version changes, so a page holding the previous version's player loads the new one. The page SHALL use `audioUrl` as given and never build the path itself. `narration` stays absent until the voice-over is stored.

#### Scenario: Present as soon as the voice-over is stored

- **GIVEN** a session whose voice-over has just been stored and that has no scene yet
- **WHEN** the session is read
- **THEN** `narration.version` is 1 and `narration.audioUrl` points at that session's narration audio

#### Scenario: A new version, a new URL

- **GIVEN** a session at narration version 1
- **WHEN** a narration take is kept and the session is read again
- **THEN** `narration.version` is 2 and `narration.audioUrl` differs from the version 1 URL

#### Scenario: Absent before the voice-over

- **GIVEN** a session whose voice-over is generating
- **WHEN** the session is read
- **THEN** `narration` is absent

### Requirement: The Voice-over section plays the narration with Play, Pause and Stop

When the session read carries `narration.audioUrl`, the Voice-over section SHALL show a player named "Voice-over player" with three buttons, **Play**, **Pause** and **Stop**, and no other control. This holds whatever the later phases are doing, including before decomposition and while scenes are built. Nothing SHALL be downloaded before Play. Play starts or resumes the narration. Pause keeps the position. Stop pauses it and returns to the start. A button that would do nothing is disabled: Play while playing, Pause while not playing, Stop at the start while not playing. When the narration ends, the player returns to the not-playing state. When the version changes, the player is replaced and starts from the beginning.

#### Scenario: Shown once the voice-over is stored

- **GIVEN** a session whose voice-over is stored and whose scenes are not built
- **WHEN** the User opens the session
- **THEN** the Voice-over section shows Play enabled and Pause and Stop disabled, and no narration audio has been requested

#### Scenario: Not shown before the voice-over

- **GIVEN** a session whose voice-over is generating
- **WHEN** the User opens the session
- **THEN** the Voice-over section shows no player

#### Scenario: Play, Pause, Stop

- **GIVEN** the voice-over player in the Voice-over section
- **WHEN** the User clicks Play, then Pause, then Play, then Stop
- **THEN** the narration starts, holds its position, resumes from it, and then stops at the start with Play enabled and Pause and Stop disabled

### Requirement: One player plays at a time on the session page

Starting the voice-over SHALL pause a scene clip that is playing. Starting a scene clip SHALL pause the voice-over. A paused player keeps its position.

#### Scenario: The voice-over pauses a playing clip

- **GIVEN** scene 2's clip is playing
- **WHEN** the User clicks Play on the voice-over player
- **THEN** scene 2's clip is paused at its position and the voice-over plays

#### Scenario: A clip pauses the voice-over

- **GIVEN** the voice-over is playing
- **WHEN** the User clicks Play on scene 2's clip
- **THEN** the voice-over is paused at its position and the clip plays

### Requirement: A narration that cannot be played says so

When the browser cannot load or play the narration, the player SHALL return to the not-playing state and say "The voice-over could not be played." Nothing else on the page changes.

#### Scenario: The audio fails to load

- **GIVEN** the voice-over player
- **WHEN** the User clicks Play and the audio cannot be loaded
- **THEN** the player shows "The voice-over could not be played." with Play enabled
