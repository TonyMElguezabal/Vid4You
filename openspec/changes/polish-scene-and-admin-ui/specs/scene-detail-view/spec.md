## MODIFIED Requirements

### Requirement: Scene details show the available results

The scene-details panel SHALL show one picture for the scene. When `result.videoUrl` is present, that picture is the scene's clip player, whose poster is the scene image: it shows the image until the clip plays, and again after Stop. When only `result.imageUrl` is present, it is the image, resolved against the API base. When neither is present, it SHALL show no picture (AC3). The panel SHALL NOT show the image and the clip's poster side by side, and the page SHALL have exactly one player for the scene.

#### Scenario: Image available

- **GIVEN** a scene with `result.imageUrl` and no `result.videoUrl`
- **WHEN** its details are expanded
- **THEN** an image of scene N is shown from that URL, and no video

#### Scenario: Clip available

- **GIVEN** a scene with `result.imageUrl` and `result.videoUrl`
- **WHEN** its details are expanded
- **THEN** the page has exactly one video for scene N, with the scene image as its poster
- **AND** no separate image of scene N is shown

#### Scenario: Nothing available

- **GIVEN** a scene with no `result`
- **WHEN** its details are expanded
- **THEN** neither an image nor a video is shown

### Requirement: The scene card plays a stored clip with Play, Pause and Stop

A scene card SHALL show a player for the scene's clip, with its image as the poster, exactly when `result.videoUrl` is present, collapsed or expanded, with no reload when the clip arrives. It SHALL offer one Play/Pause button and one Stop button, and no other playback control. Each button SHALL show an icon, with its action as a tooltip.

The Play/Pause button SHALL be named `Play scene {index} clip` while the clip does not play and `Pause scene {index} clip` while it plays, and SHALL do what its name says. Play SHALL start the clip, or resume it where it was paused. Pause SHALL stop playback and keep the position.

`Stop scene {index} clip` SHALL be present only while the clip plays or is away from its start. It SHALL stop playback, return to the start and show the poster again. A clip that ends returns to the not-playing state and keeps Stop until it is pressed.

The player SHALL NOT download the clip before the User plays it. A clip that cannot be played SHALL show `Scene {index} clip could not be played.` in a `role="status"`.

#### Scenario: Clip arrives while the page is open

- **GIVEN** the page is open and scene 2 has no clip
- **WHEN** a live update for scene 2 carries `result.videoUrl`
- **THEN** scene 2's card shows its clip and `Play scene 2 clip` without a reload, while its details stay collapsed
- **AND** `Stop scene 2 clip` is not shown

#### Scenario: No clip yet

- **GIVEN** a scene with no `result.videoUrl`
- **WHEN** the page renders
- **THEN** its card shows no player, no Play/Pause button and no Stop button

#### Scenario: Play, pause and resume

- **GIVEN** scene 2's clip is shown and not playing
- **WHEN** the User presses `Play scene 2 clip`
- **THEN** the clip plays, the button is named `Pause scene 2 clip`, and `Stop scene 2 clip` is shown
- **AND** when the User presses `Pause scene 2 clip` at 3 s, the clip pauses at 3 s, the button is named `Play scene 2 clip`, and Stop stays
- **AND** when the User presses `Play scene 2 clip` again, the clip resumes from 3 s

#### Scenario: Stop

- **GIVEN** scene 2's clip is playing at 4 s
- **WHEN** the User presses `Stop scene 2 clip`
- **THEN** the clip stops, is back at 0 s and shows its poster
- **AND** the button is named `Play scene 2 clip` and `Stop scene 2 clip` is no longer shown

#### Scenario: Loads on demand

- **GIVEN** a session page with many stored clips
- **WHEN** the page renders
- **THEN** every player is set not to preload, and no clip is downloaded until its Play is pressed

#### Scenario: A clip that cannot be played

- **GIVEN** scene 2's clip is shown
- **WHEN** the player reports an error
- **THEN** `Scene 2 clip could not be played.` is shown and `Play scene 2 clip` stays available to try again

#### Scenario: Rebuilt scene

- **GIVEN** scene 2's clip is shown and paused at 3 s
- **WHEN** a live update gives scene 2 a new `result.videoUrl`
- **THEN** the player loads the new clip, from the start and not playing, with no Stop shown

## ADDED Requirements

### Requirement: At most one scene's details are open

The scene list SHALL keep at most one scene's details open. Opening a scene's details SHALL close the details of the scene that was open. `Hide scene {index} details` SHALL close them and open none. When a scene's details open, its card SHALL be scrolled into view as far as needed to show it. A live update SHALL NOT open or close any scene's details. Closing a scene's details by opening another SHALL have the same effect on that scene as `Hide scene {index} details`.

The toggle keeps its accessible names, `View scene {index} details` and `Hide scene {index} details`; its visible text MAY be shorter ("Details", "Hide details").

#### Scenario: Opening a second scene

- **GIVEN** scene 2's details are open
- **WHEN** the User presses `View scene 5 details`
- **THEN** scene 5's details are open, scene 2's details are closed, and scene 5's card is in view

#### Scenario: Hiding the open scene

- **GIVEN** scene 5's details are open
- **WHEN** the User presses `Hide scene 5 details`
- **THEN** no scene's details are open

#### Scenario: A live update leaves the open scene alone

- **GIVEN** scene 5's details are open
- **WHEN** a live update changes scene 2's state
- **THEN** scene 5's details are still open and scene 2's are still closed
