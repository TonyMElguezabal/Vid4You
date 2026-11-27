## ADDED Requirements

### Requirement: The assembly reports its progress

While an assembly attempt runs, the assembly SHALL report its progress in two steps:
- `preparing-clips`: each clip is normalized, one after another, with the number of clips done and the total;
- `encoding`: the normalized clips, the narration and the subtitles are encoded into the final video.

The percentage SHALL be the frames encoded so far, in both steps together, out of twice the video's frames, rounded down to a whole number from 0 to 99. It SHALL never go back within an attempt. It SHALL be 100 only when the attempt succeeds. A new attempt, such as a retry, SHALL start again from 0.

#### Scenario: Halfway through the clips
- **GIVEN** a session of 70 scenes of equal length
- **WHEN** clips 1 to 35 are normalized and clip 36 has not started
- **THEN** the progress is `preparing-clips`, 35 of 70, at 25%

#### Scenario: Encoding
- **WHEN** every clip is normalized and the final encode has written half of the frames
- **THEN** the progress is `encoding` at 75%

#### Scenario: A retry
- **WHEN** an attempt fails at 60% and the next attempt starts
- **THEN** the progress is `preparing-clips`, 0 clips done, at 0%

### Requirement: The session read carries the assembly progress

While an assembly attempt of the session runs in this process, the session read SHALL carry `assemblyProgress`:
- `step`: `preparing-clips` or `encoding`;
- `clipsDone` and `clipsTotal`;
- `percent`.

It SHALL be absent otherwise. A live update with the progress SHALL be sent when the step changes, and otherwise at most once per second. The progress SHALL be kept in memory only. After a restart, it SHALL be absent until the next attempt reports.

#### Scenario: No assembly running
- **WHEN** the session has no assembly attempt in flight
- **THEN** the read carries no `assemblyProgress`

#### Scenario: Live updates are throttled
- **WHEN** ffmpeg reports its frames ten times in one second, within the same step
- **THEN** at most one live update carries the progress in that second

### Requirement: The Final video section shows the build progress

While the session's final video is being built (the first build, a retry or a rebuild), the Final video section SHALL show a progress bar named "Final video progress", with its percentage and a line that says:
- "Waiting to start", before the first progress arrives, including while the session is paused;
- "Preparing clips: {clipsDone} of {clipsTotal}";
- "Encoding the final video".

The bar SHALL disappear when the build ends. On success, the new version is shown. On failure, the cause is shown, as before.

#### Scenario: A rebuild in progress
- **GIVEN** the User pressed "Rebuild final video"
- **WHEN** the assembly is preparing clip 24 of 70
- **THEN** the Final video section shows the bar at its percentage and "Preparing clips: 23 of 70"

#### Scenario: The first build
- **GIVEN** every scene is complete and the session has no final video yet
- **WHEN** the assembly is encoding
- **THEN** the Final video section shows the bar and "Encoding the final video" instead of "Available once every scene is done"

### Requirement: The download is disabled while a new version is being built

While a session that has a final video is building a new version, the Final video section SHALL show "Download final video" as a disabled button, and say "The download is available again when the new version is ready."

The version number and the route SHALL be unchanged: the route keeps serving the current version.

When the build succeeds, the download SHALL be enabled with the new version. When it fails, the download SHALL be enabled with the previous version, and the failure cause SHALL be shown.

#### Scenario: Pressing Download during a rebuild
- **GIVEN** version 1 exists and version 2 is being built
- **THEN** "Download final video" is disabled, and the page says when it comes back

#### Scenario: The rebuild fails
- **WHEN** the rebuild fails after its retry budget
- **THEN** "Download final video" is enabled and downloads version 1, and the cause is shown
