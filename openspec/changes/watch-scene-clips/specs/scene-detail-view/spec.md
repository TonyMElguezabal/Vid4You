## MODIFIED Requirements

### Requirement: The session read points at a scene's viewable results

Each scene on the session read and in live updates SHALL carry `result.imageUrl`, the image route's path for that scene, exactly when the scene has a stored image, including a `failed` scene whose image was stored before it failed. It SHALL carry `result.videoUrl`, the clip route's path for that scene, exactly when the scene has a stored clip. Both paths SHALL change when the scene is rebuilt, so the page loads the new file.

#### Scenario: Image stored

- **GIVEN** a scene with a stored image
- **WHEN** the session is read
- **THEN** its `result.imageUrl` is `/sessions/{sessionId}/scenes/{sceneId}/image`

#### Scenario: Clip stored

- **GIVEN** a scene with a stored image and a stored clip
- **WHEN** the session is read
- **THEN** its `result.videoUrl` is `/sessions/{sessionId}/scenes/{sceneId}/clip`

#### Scenario: Clip stored while the page is open

- **GIVEN** a scene in `video-generating`, with no `result.videoUrl`
- **WHEN** its clip is stored
- **THEN** the live update for that scene carries `result.videoUrl`

#### Scenario: Rebuilt scene

- **GIVEN** a scene rebuilt once, with a stored clip
- **WHEN** the session is read
- **THEN** its `result.videoUrl` is `/sessions/{sessionId}/scenes/{sceneId}/clip?r=1`

#### Scenario: Failed after its image was stored

- **GIVEN** a scene that stored its image and then failed
- **WHEN** the session is read
- **THEN** it still carries `result.imageUrl` and no `result.videoUrl`

#### Scenario: Nothing stored

- **GIVEN** a scene with no stored image
- **WHEN** the session is read
- **THEN** it has no `result`

### Requirement: Scene details show the available results

The scene-details panel SHALL show the scene's image when `result.imageUrl` is present, resolved against the API base, and SHALL show no image when it is absent (AC3). The clip SHALL NOT have a second player in the details: it plays in the scene card (see "The scene card plays a stored clip with Play, Pause and Stop").

#### Scenario: Image available

- **GIVEN** a scene with `result.imageUrl`
- **WHEN** its details are expanded
- **THEN** an image of scene N is shown from that URL

#### Scenario: Clip available

- **GIVEN** a scene with `result.videoUrl`
- **WHEN** its details are expanded
- **THEN** the page has exactly one video for scene N, the card's player

#### Scenario: Nothing available

- **GIVEN** a scene with no `result`
- **WHEN** its details are expanded
- **THEN** neither an image nor a video is shown

## ADDED Requirements

### Requirement: A scene's stored clip is served inline, scoped to its session, with byte ranges

`GET /sessions/:sessionId/scenes/:sceneId/clip` SHALL return the scene's stored clip inline as `video/mp4` with `Accept-Ranges: bytes`. A request with a single `Range: bytes=start-end`, `bytes=start-` or `bytes=-suffix` header SHALL answer 206 with `Content-Range` and exactly those bytes. A range that starts at or past the end of the file SHALL answer 416 with `Content-Range: bytes */{size}`. A header that is not one byte range SHALL be ignored, and the whole file returned with 200. The route SHALL answer 404 when the scene does not belong to that session, has no stored clip, or the file is missing. A stored path that resolves outside the session's project folder SHALL be refused and never read. The route SHALL accept no body and change nothing.

#### Scenario: Whole clip

- **GIVEN** a scene with a stored clip of 1,000 bytes
- **WHEN** its clip is requested without a `Range` header
- **THEN** the response is 200, `video/mp4`, `Accept-Ranges: bytes`, with no `Content-Disposition: attachment`, and the file's exact bytes

#### Scenario: A byte range

- **GIVEN** a scene with a stored clip of 1,000 bytes
- **WHEN** its clip is requested with `Range: bytes=100-199`
- **THEN** the response is 206, `Content-Range: bytes 100-199/1000`, `Content-Length: 100`, with bytes 100 to 199 of the file

#### Scenario: An open-ended and a suffix range

- **GIVEN** a scene with a stored clip of 1,000 bytes
- **WHEN** its clip is requested with `Range: bytes=900-`, and then with `Range: bytes=-100`
- **THEN** both answers are 206 with `Content-Range: bytes 900-999/1000` and the last 100 bytes

#### Scenario: A range past the end

- **GIVEN** a scene with a stored clip of 1,000 bytes
- **WHEN** its clip is requested with `Range: bytes=1000-`
- **THEN** the response is 416 with `Content-Range: bytes */1000`

#### Scenario: A clip not yet stored

- **GIVEN** a scene in `video-generating`
- **WHEN** its clip is requested
- **THEN** the response is 404

#### Scenario: A scene of another session

- **GIVEN** a scene that belongs to session A
- **WHEN** its clip is requested under session B's identifier
- **THEN** the response is 404 and no file is read

#### Scenario: A stored path escaping the project folder

- **GIVEN** a scene whose stored clip is `../other-session/scene-1.mp4`
- **WHEN** its clip is requested
- **THEN** the request is refused and the file outside the folder is not read

### Requirement: The scene card plays a stored clip with Play, Pause and Stop

A scene card SHALL show a player for the scene's clip, with its image as the poster, exactly when `result.videoUrl` is present, collapsed or expanded, with no reload when the clip arrives. It SHALL offer three buttons, `Play scene {index} clip`, `Pause scene {index} clip` and `Stop scene {index} clip`, and no other playback control. Play SHALL start the clip, or resume it where it was paused. Pause SHALL stop playback and keep the position. Stop SHALL stop playback and return to the start. Play SHALL be disabled while the clip plays; Pause and Stop SHALL be disabled while it does not play, except that Stop SHALL stay enabled while a paused clip is away from its start. The player SHALL NOT download the clip before the User plays it. A clip that cannot be played SHALL show `Scene {index} clip could not be played.` in a `role="status"`.

#### Scenario: Clip arrives while the page is open

- **GIVEN** the page is open and scene 2 has no clip
- **WHEN** a live update for scene 2 carries `result.videoUrl`
- **THEN** scene 2's card shows its clip and the three buttons without a reload, while its details stay collapsed

#### Scenario: No clip yet

- **GIVEN** a scene with no `result.videoUrl`
- **WHEN** the page renders
- **THEN** its card shows no player and none of the three buttons

#### Scenario: Play, pause and resume

- **GIVEN** scene 2's clip is shown and not playing
- **WHEN** the User presses `Play scene 2 clip`, then `Pause scene 2 clip` at 3 s, then `Play scene 2 clip`
- **THEN** the clip plays, pauses at 3 s, and resumes from 3 s

#### Scenario: Stop

- **GIVEN** scene 2's clip is playing at 4 s
- **WHEN** the User presses `Stop scene 2 clip`
- **THEN** the clip stops and is back at 0 s, and Play starts it from the beginning

#### Scenario: Loads on demand

- **GIVEN** a session page with many stored clips
- **WHEN** the page renders
- **THEN** every player is set not to preload, and no clip is downloaded until its Play is pressed

#### Scenario: A clip that cannot be played

- **GIVEN** scene 2's clip is shown
- **WHEN** the player reports an error
- **THEN** `Scene 2 clip could not be played.` is shown and Play stays available to try again

#### Scenario: Rebuilt scene

- **GIVEN** scene 2's clip is shown and paused at 3 s
- **WHEN** a live update gives scene 2 a new `result.videoUrl`
- **THEN** the player loads the new clip, from the start and not playing

### Requirement: Only one scene clip plays at a time

Starting a scene clip SHALL pause any other scene clip that is playing, keeping that clip's position.

#### Scenario: Second clip started

- **GIVEN** scene 1's clip is playing
- **WHEN** the User presses `Play scene 2 clip`
- **THEN** scene 2's clip plays and scene 1's clip is paused at its position

### Requirement: Every scene card shows its scene number

Every scene card SHALL show `Scene {index}` in its status line, in every state:
- before its image;
- with its image;
- with its clip player;
- expanded.

The number SHALL be the scene's 1-based `index`, the one the scene progress summary and every scene action name. It SHALL NOT depend on the thumbnail, which a stored clip replaces.

#### Scenario: A scene with a clip
- **GIVEN** scene 4 has a stored clip, so its card shows the clip player instead of the thumbnail
- **THEN** its card shows "Scene 4"

#### Scenario: An expanded scene
- **WHEN** the User expands scene 4's details
- **THEN** its card still shows "Scene 4"
