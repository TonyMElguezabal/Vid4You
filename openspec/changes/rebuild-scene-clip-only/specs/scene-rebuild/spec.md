## MODIFIED Requirements

### Requirement: The User can rebuild a generated scene

The system SHALL accept `POST /sessions/{sessionId}/scenes/{sceneId}/rebuild` for a scene whose state is `image-complete` or `chunk-complete`, in any session state, while no assembly of that session is running. The body MAY carry:
- `imageInstruction` and/or `videoInstruction`, non-empty after trimming. An omitted field keeps the stored instruction.
- `scope`: `image-and-clip` or `clip`. An omitted `scope` is `image-and-clip`. The `clip` scope is the clip-only rebuild, specified in "The User can rebuild only a scene's clip".

An accepted rebuild with the `image-and-clip` scope SHALL, atomically, store the given instructions, clear the scene's image and clip results, and return the scene to `submitted`. It SHALL answer 202 and then generate the image and then the clip through the normal stages, with the scene's bound image and video providers (PRD §11.2), a fresh retry budget, the same time limits and the same concurrency slots.

A rebuild SHALL NOT change any other scene, the voice-over, the narration timestamps, the scene's `ID`, `PROMPT`, narration text, order, narration interval or requested clip duration, or the speed-factor limit. A failure during the rebuild SHALL be a normal scene failure, recovered with the existing retry and correction.

#### Scenario: A complete scene with a typo in its image
- **GIVEN** scene 4 of a session in `final-video` is `chunk-complete`
- **WHEN** the User rebuilds it with a corrected `imageInstruction`
- **THEN** the answer is 202 and scene 4 goes `submitted` → `image-generating` → `image-complete` → `video-generating` → `chunk-complete`
- **AND** the image request uses the corrected instruction and scene 4's bound image provider, even if the active image provider has changed

#### Scenario: Rebuild while other scenes are still processing
- **GIVEN** a session in `chunks-processing` whose scene 2 is `image-complete` and has not sent its clip request
- **WHEN** the User rebuilds scene 2
- **THEN** it is accepted, scene 2's image is generated again, and no clip is generated from the previous image

#### Scenario: Instructions omitted
- **WHEN** the User rebuilds a scene with an empty body
- **THEN** the stored `IMAGE` and `VIDEO` instructions are used unchanged, and the image and the clip are both generated again

#### Scenario: Locked data is unchanged
- **WHEN** a scene is rebuilt
- **THEN** the voice-over file, the timestamps, every scene's narration interval and requested duration, and every other scene's results are unchanged

#### Scenario: A rebuild that fails
- **GIVEN** a rebuilt scene whose image attempts exhaust their retry budget
- **THEN** the scene is `failed` at the image stage and offers the existing Retry and Save correction

## ADDED Requirements

### Requirement: The User can rebuild only a scene's clip

A rebuild with `scope: "clip"` SHALL be accepted only for a scene in `chunk-complete` whose image and clip are stored, with the same session conditions as a full rebuild. The body MAY carry `videoInstruction`. A body that carries `imageInstruction` with `scope: "clip"` SHALL be refused with 400, changing nothing.

An accepted clip-only rebuild SHALL, atomically:
- store the given `VIDEO` instruction;
- clear the scene's clip result only;
- keep the scene's image result, its file and its `IMAGE` instruction;
- return the scene to `image-complete`.

It SHALL answer 202, send no image request, and then generate the clip from the stored image through the normal video stage. The video stage uses the scene's bound video provider, a fresh retry budget, the same time limit and the same concurrency slot.

Everything else SHALL be as for a full rebuild:
- the locked data is unchanged;
- the new clip is written to a new file with the rebuild number, and the earlier clip stays on disk;
- the clip URL changes;
- a stored final video is marked as older than the current scenes and is not assembled again by itself.

A failure SHALL be a normal clip failure, recovered with the existing clip Retry and Save correction.

A clip-only rebuild SHALL answer 409 `scene-not-ready` for any other scene, including:
- one in `image-complete`, which has no clip yet;
- a scene with no stored clip or image. It SHALL answer `unknown-scene` and `assembly-in-progress` as a full rebuild does.

#### Scenario: Only the clip is wrong
- **GIVEN** scene 4 of a session in `final-video` is `chunk-complete`, with image `scene-4-attempt-1.png` and clip `scene-4.mp4`
- **WHEN** the User rebuilds it with `scope: "clip"` and a corrected `videoInstruction`
- **THEN** the answer is 202, and scene 4 goes `image-complete` → `video-generating` → `chunk-complete`
- **AND** no image request is sent, and the clip request uses the stored image, the corrected instruction and scene 4's bound video provider
- **AND** scene 4's image is still `scene-4-attempt-1.png`, its new clip is `scene-4-r1.mp4`, and `scene-4.mp4` is unchanged

#### Scenario: Clip only with the instruction unchanged
- **WHEN** the User rebuilds a `chunk-complete` scene with `{ "scope": "clip" }`
- **THEN** the clip is generated again with the stored `VIDEO` instruction, and the `IMAGE` instruction and the image are unchanged

#### Scenario: The final video after a clip-only rebuild
- **GIVEN** a session in `final-video` with version 1
- **WHEN** scene 4's clip is rebuilt and scene 4 reaches `chunk-complete`
- **THEN** no assembly starts, version 1 stays current, and "Rebuild final video" is offered

#### Scenario: An image instruction with clip only
- **WHEN** the User sends `{ "scope": "clip", "imageInstruction": "A red boat" }`
- **THEN** the answer is 400, and the scene and its instructions are unchanged

#### Scenario: No clip to rebuild
- **GIVEN** scene 2 is `image-complete` and its clip was never generated
- **WHEN** the User rebuilds scene 2 with `scope: "clip"`
- **THEN** the answer is 409 `scene-not-ready`, and nothing is changed or sent

#### Scenario: A clip-only rebuild that fails
- **GIVEN** a clip-only rebuild whose clip attempts exhaust their retry budget
- **THEN** the scene is `failed` at the video stage, keeps its image, and offers the existing clip Retry and Save correction

### Requirement: The page offers a clip-only rebuild

The Rebuild scene form of a `chunk-complete` scene with a clip SHALL ask what to rebuild, with two choices:
- "Image and clip", selected when the form opens;
- "Clip only, keep the current image".

With "Clip only" selected:
- the form SHALL hide the `IMAGE` field, and show only the `VIDEO` field, prefilled with the stored value;
- its confirmation SHALL state that only the clip is generated again from the current image by the video provider, which costs one request, and that the User rebuilds the final video after checking the scenes;
- its submit button SHALL read "Rebuild clip", and it SHALL send `scope: "clip"` with the `VIDEO` instruction only when the User changed it.

With "Image and clip" selected, the form SHALL be as specified in "The page offers Rebuild scene", and it SHALL send no `scope`. The form of an `image-complete` scene SHALL NOT show the choice. A refusal SHALL be shown as a sentence, not a code.

#### Scenario: Rebuild only the clip from the page
- **GIVEN** scene 4 is `chunk-complete`
- **WHEN** the User opens Rebuild scene 4, chooses "Clip only, keep the current image", edits `VIDEO`, and confirms "Rebuild clip"
- **THEN** the command is sent with `scope: "clip"` and the edited `videoInstruction`, and scene 4's image stays on its card while its state updates live to `video-generating`

#### Scenario: Switching the choice
- **GIVEN** the User edited `IMAGE` and then chose "Clip only"
- **THEN** the `IMAGE` field is hidden and its edit is not sent
- **AND** choosing "Image and clip" again shows the field with the edit

#### Scenario: A scene without a clip
- **GIVEN** scene 2 is `image-complete`
- **WHEN** the User opens Rebuild scene 2
- **THEN** the form shows no choice, and it rebuilds the image and the clip as today
