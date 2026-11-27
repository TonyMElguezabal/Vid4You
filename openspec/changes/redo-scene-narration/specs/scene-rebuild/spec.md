## MODIFIED Requirements

### Requirement: The final video is regenerated automatically after a rebuild

When a scene reaches `chunk-complete` and every scene of the session is `chunk-complete`, the assembly SHALL start by itself with every scene's current clip only in a session without a final video: one still processing, or failed at assembly. This is the normal assembly, and on success it clears the assembly failure.

A session with a final video SHALL NOT be assembled again by itself after a scene rebuild, so the User can check every scene first. The final video SHALL be marked as older than the current scenes (`staleScenes`), and "Rebuild final video" SHALL be offered once every scene is `chunk-complete`. The User's rebuild opens a new cycle and writes a new version `final-video-<version>.mp4` with the stored pause edits applied. The previous version stays current and downloadable until the new one succeeds.

While any scene is failed or still generating, no assembly SHALL start. A failed or interrupted rebuild SHALL leave the previous final video current, and SHALL keep "Rebuild final video" offered until a rebuild succeeds.

#### Scenario: One scene rebuilt after the final video
- **GIVEN** a session in `final-video` with version 1
- **WHEN** scene 4 is rebuilt and reaches `chunk-complete`
- **THEN** no assembly starts, version 1 stays current, and "Rebuild final video" is offered
- **AND** when the User rebuilds and the rebuild succeeds, `final-video-2.mp4` is current and includes scene 4's new clip, and the other scenes' clips are the same files as in version 1

#### Scenario: Two scenes rebuilt
- **GIVEN** scenes 2 and 7 are rebuilt one after the other
- **WHEN** scene 2 completes while scene 7 is still generating
- **THEN** "Rebuild final video" is not offered until scene 7 completes, and no assembly starts by itself

#### Scenario: A session failed at assembly
- **GIVEN** a session whose assembly failed, with no final video
- **WHEN** a scene is rebuilt and completes
- **THEN** the assembly runs again by itself and, on success, the session is `final-video`

#### Scenario: Continue does not rebuild
- **GIVEN** a paused session whose final video is older than a rebuilt scene
- **WHEN** the User continues the session
- **THEN** no assembly starts, and "Rebuild final video" stays offered

#### Scenario: The rebuild fails
- **WHEN** the User's rebuild fails after its retry budget
- **THEN** the previous final video stays current and downloadable, the read carries the rebuild's failure cause, and "Rebuild final video" is offered

#### Scenario: Restart after a rebuilt scene
- **GIVEN** a rebuilt scene completed and the final video was not rebuilt yet
- **WHEN** the app restarts and the User opens the session
- **THEN** no assembly starts, the previous final video is current, and "Rebuild final video" is offered

### Requirement: The page offers Rebuild scene

The expanded details of a scene in `image-complete` or `chunk-complete` SHALL show a "Rebuild scene" action while the session is not assembling its final video. The action SHALL show the scene's `IMAGE` and `VIDEO` instructions in editable fields, prefilled with the stored values. Its confirmation SHALL state that the image and the clip are generated again by the providers, and that the User rebuilds the final video after checking the scenes. A refusal SHALL be shown as a sentence, not a code. Scenes in other states SHALL NOT show the action.

While its final video is older than the current scenes or narration, the page SHALL say so next to the final video, and ask the User to check every scene before rebuilding it.

#### Scenario: Rebuild from the page
- **GIVEN** scene 4 is `chunk-complete`
- **WHEN** the User expands it, edits `IMAGE`, and confirms Rebuild scene
- **THEN** the command is sent with the edited `imageInstruction`, and scene 4's state updates live to `image-generating`

#### Scenario: Rebuild final video only while every scene is complete
- **GIVEN** a final video older than a rebuilt scene (or with pause edits pending), and a scene that is still being rebuilt
- **THEN** the page does not offer "Rebuild final video" until every scene is complete again, because the command would be refused with `scenes-not-complete`
- **AND** if the command is refused anyway, the refusal is shown as a sentence

#### Scenario: A stale final video is explained
- **GIVEN** scene 4 was rebuilt after version 1 and is `chunk-complete`
- **THEN** the final video card says the version predates the changes, asks the User to check every scene, and offers "Rebuild final video"

#### Scenario: No action while generating or assembling
- **GIVEN** scene 5 is `video-generating`, or the session's final video is being assembled
- **THEN** scene 5 (or every scene) shows no Rebuild scene action
