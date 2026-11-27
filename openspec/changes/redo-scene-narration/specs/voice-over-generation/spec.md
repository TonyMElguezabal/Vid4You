## MODIFIED Requirements

### Requirement: A session has at most one voice-over

The store SHALL enforce that a session has at most one voice-over. A repeated success confirmation SHALL NOT create a second MP3 or voice-over record and SHALL NOT launch any following phase again. No operation SHALL launch voice generation for a session in `voice-over-complete` or any later state. The one exception is a narration take that the User confirmed for consecutive scenes (spec `scene-narration-redo`). It sends only the selected scenes' text, and it never creates a voice-over record, changes the stored MP3 or launches a following phase.

#### Scenario: The same success confirmation arrives twice

- **WHEN** a success confirmation for a session that already has a voice-over is processed
- **THEN** no second voice-over is stored
- **AND** nothing is launched again

#### Scenario: Two confirmations arrive concurrently

- **WHEN** two success confirmations for the same session are processed at the same time
- **THEN** exactly one voice-over is stored

#### Scenario: Generation is requested after completion

- **WHEN** voice generation is requested for a session in `voice-over-complete` or a later state
- **THEN** no request is sent to the provider
- **AND** the stored MP3 is unchanged

#### Scenario: A confirmed narration take after completion

- **WHEN** the User confirms a narration take of scenes 1 and 2 of a session in `final-video`
- **THEN** one request with only their text is sent to the session's voice provider
- **AND** the voice-over record and the stored MP3 are unchanged
