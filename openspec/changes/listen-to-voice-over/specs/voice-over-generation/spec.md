## MODIFIED Requirements

### Requirement: The session exposes the voice-over outcome

The session representation SHALL expose the voice-over's provider, duration, native-timestamp availability and completion time once it exists, and the failed phase, cause and retryability when the voice-over failed. It SHALL NOT expose a download of the MP3: no download control, and no route that answers with `Content-Disposition: attachment`. The one exception is listen-to-voice-over's playback: the current narration MAY be served inline, read-only, to the Voice-over player (`GET /sessions/{sessionId}/narration/audio`). Each voice-over state change SHALL be published to the live-update mechanism.

#### Scenario: The voice-over is complete

- **WHEN** a session in `voice-over-complete` is read
- **THEN** its representation includes the voice provider, the duration, whether native timestamps are available and the completion time

#### Scenario: The voice-over failed

- **WHEN** a session whose voice-over failed is read
- **THEN** its representation includes the failed phase `voice-over`, the cause and whether it is retryable

#### Scenario: A download of the MP3 is sought

- **WHEN** the application's download options for a session are inspected
- **THEN** no download of the voice-over MP3 is offered, and the narration audio route answers inline, without `Content-Disposition: attachment`

#### Scenario: No other route serves the narration

- **WHEN** the application's routes are listed
- **THEN** the only routes naming the voice-over or the narration are the voice-over retry, the narration takes and the narration audio route, and `/sessions/{sessionId}/voice-over`, `/voice-over.mp3` and `/audio` answer 404

#### Scenario: The state changes while the session page is open

- **WHEN** the session moves between `submitted`, `voice-over-generating`, `voice-over-complete` and `failed`
- **THEN** each change is published to the live-update mechanism
