## Why

"Rebuild scene" always generates the image and then the clip again. Often the image is right and only the clip is wrong: the motion, the camera or a glitch. Rebuilding the image as well costs an image request the User does not need. It can also replace an image the User liked with a worse one.

## What Changes

- The Rebuild scene form asks what to rebuild: **Image and clip** (today's behavior, still the default) or **Clip only**.
- With Clip only:
  - the stored image is kept, and only the clip is generated again from it, with the scene's bound video provider;
  - the IMAGE field is not shown, and only the VIDEO instruction can be edited;
  - the confirmation says that only the clip is generated again, which costs one video request.
- Clip only is offered only for a scene whose clip is stored (`chunk-complete`). A scene in `image-complete` has no clip yet, so it offers only Image and clip, as today.
- The rebuild command takes an optional `scope`: `image-and-clip` (the default, so existing calls are unchanged) or `clip`. With `clip`, the scene goes from `chunk-complete` to `image-complete`, then through the normal video stage.
- Everything else is as for a full rebuild:
  - a new clip file name with the rebuild number;
  - the final video is marked as older, and the User rebuilds it;
  - the same refusals;
  - a failure is a normal clip failure, with its retry and correction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scene-rebuild`:
  - "The User can rebuild a generated scene" gains the `scope` field. The full rebuild is the `image-and-clip` scope.
  - A new requirement covers the clip-only rebuild: when it is accepted, what it keeps, and its refusals.
  - A new requirement covers the page's Clip only choice.

## Impact

- **Backend:**
  - `POST /sessions/{sessionId}/scenes/{sceneId}/rebuild` takes `scope`. `imageInstruction` with `scope: "clip"` is refused with 400.
  - `sceneRebuild.ts` and `db.ts` gain the clip-only store write and the launch of the video stage.
- **Frontend:**
  - the Rebuild scene form in `SceneRow` gains the choice;
  - `rebuildScene` in the API client sends `scope`.
- **Docs:** `docs/api-spec.yml` (regenerated) and the frontend standards' accessible names.
- **Provider cost:** a clip-only rebuild sends one video request and no image request.
- **Dependency:** the page requirement builds on redo-scene-narration (JOS-282, PR #10). That change says the User, not the app, rebuilds the final video after a scene rebuild. This branch starts from that branch, and this change is archived after it.
