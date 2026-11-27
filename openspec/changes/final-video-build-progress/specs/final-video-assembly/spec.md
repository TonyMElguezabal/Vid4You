## ADDED Requirements

### Requirement: The assembly does not block the app

The assembly tool SHALL run ffmpeg and ffprobe as asynchronous child processes. It SHALL NOT wait on them synchronously. While an assembly runs, the backend SHALL keep answering every request and keep sending live updates. This applies to a first assembly, a retry and a rebuild. An ffmpeg failure SHALL be handled as before: a transient failure, retried within the budget.

#### Scenario: The rebuild request answers at once
- **WHEN** the User requests "Rebuild final video" for a session whose assembly takes minutes
- **THEN** the request answers 202 without waiting for the assembly
- **AND** the live update that marks the session as rebuilding is sent right away

#### Scenario: The app keeps answering during an assembly
- **GIVEN** an assembly is encoding
- **WHEN** the page reads the session, or requests a scene's image or clip
- **THEN** each request is answered while the assembly continues

#### Scenario: ffmpeg fails
- **WHEN** an ffmpeg step exits with an error
- **THEN** the attempt fails as transient with ffmpeg's message, and the retry policy applies as before
