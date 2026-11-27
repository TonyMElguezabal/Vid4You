## Context

rebuild-scene (JOS-235) added `POST /sessions/:sessionId/scenes/:sceneId/rebuild`:
- `rebuildScene` in `sceneRebuild.ts` decides the refusals from the store. It has no `await`, so two calls cannot both be accepted.
- `markSceneForRebuild` in `db.ts` makes one conditional write. It accepts only `image-complete` or `chunk-complete`, and:
  - clears `result` and `video_result` and resets the attempt fields;
  - increments `rebuild_count`;
  - deletes the scene's `scene_results` and `scene_video_results` rows;
  - sets `final_video_stale`;
  - returns the scene to `submitted`.

  `launchSceneStage` then starts the image stage.
- `sceneFileStem` names new files `scene-N-rK`. The scene's image and clip URLs carry `?r=K`.

The video stage already starts from `image-complete`. `launchVideoStage(sceneId)` runs only for that state and is admitted by the launch gate. `videoStageLauncher` relaunches held or interrupted `image-complete` scenes on Continue and after a restart. The clip correction (JOS-158) already uses this path: it writes `VIDEO`, sets `image-complete`, and calls `launchVideoStage`.

redo-scene-narration (JOS-282) stopped the automatic final-video rebuild after a scene rebuild. `final_video_stale` now only marks the final video as older, and the User rebuilds it.

## Goals / Non-Goals

**Goals:**
- rebuild only a scene's clip, from its stored image, with the bound video provider;
- the same refusals, file naming, stale marking and failure recovery as a full rebuild;
- the full rebuild unchanged, and still the default.

**Non-Goals:**
- Rebuilding only the image and keeping the clip. A clip is made from its image, so a new image needs a new clip.
- Choosing an earlier image or clip from disk.
- A clip-only rebuild of a scene in `image-complete`. It has no clip yet, and its clip is generated anyway.

## Decisions

1. **One command with a `scope` field, not a second route.** The body gains `scope: z.enum(["image-and-clip", "clip"]).default("image-and-clip")`. A Zod refinement refuses `imageInstruction` with `scope: "clip"`, so the request fails with the route's usual 400.
   - The refusals, the 202 answer, the `held` flag and the page's handler stay shared.
   - Existing callers send no `scope` and keep the full rebuild.
   - Alternative: `POST …/scenes/:sceneId/rebuild-clip`. Rejected because it duplicates the route, its refusals and its docs for one field.
   - Alternative: silently ignore `imageInstruction` with `clip`. Rejected because the User's edit would be lost without notice.
2. **A separate store write, `markSceneForClipRebuild(sessionId, sceneId, videoInstruction?)`, next to `markSceneForRebuild`.** It is one conditional `UPDATE … WHERE status = 'chunk-complete' AND result IS NOT NULL AND video_result IS NOT NULL` in a transaction. It:
   - sets `status = 'image-complete'`, `video_result = NULL` and `video_instruction = COALESCE(?, video_instruction)`;
   - resets `attempts`, `last_error`, `current_request_id`, `video_request_sent_at` and `video_request`;
   - increments `rebuild_count`;
   - deletes `scene_video_results`;
   - sets `final_video_stale`;
   - records the corrected `VIDEO` instruction as a full rebuild does.

   `result`, `scene_results`, `image_instruction` and the image file are not touched. If the condition does not match, it returns false, which gives `scene-not-ready`.
   - Alternative: add a flag to `markSceneForRebuild`. Rejected: the two writes differ in the target state, the cleared columns and the allowed states. One function with branches in its SQL is harder to read than two short ones.
3. **`rebuildScene` takes the scope and calls `launchVideoStage` for a clip.** The checks for an unknown session or scene and for a running assembly come first and are unchanged. Then the matching store write runs, then the launch:
   - `launchSceneStage` for `image-and-clip`;
   - `launchVideoStage` for `clip`.

   Then come `broadcast` and the `held` answer, unchanged. A held clip (paused session, launch gate) stays `image-complete` and is launched by `videoStageLauncher` on Continue or after a restart, as for any scene waiting for its clip.
4. **`rebuild_count` increments for a clip-only rebuild.** The new clip is `scene-N-rK.mp4`, so the earlier clip is never overwritten and the clip URL changes. The image keeps its stored path. Its URL also carries the new `?r=K`, which only makes the browser fetch the same file once more. A second count for clips alone was considered and rejected, since it would need a migration for no visible gain.
5. **The page: a radio group in the existing Rebuild scene form.** It is shown only when the scene is `chunk-complete` and has a clip URL.
   - The group is labeled "What to rebuild for scene N", with "Image and clip" (checked) and "Clip only, keep the current image".
   - With Clip only, the IMAGE label and field are not rendered, and the image draft is kept in state. Switching back shows the edit again.
   - The confirmation sentence and the submit text change to "Rebuild clip".
   - `rebuildChanges` drops `imageInstruction` and adds `scope: "clip"`.
   - `SceneRebuildHandler` and `rebuildScene` in the API client gain the optional `scope`.

   Native radio inputs give keyboard use and accessible names with no new component.
   - Alternative: a second submit button, "Rebuild clip only", next to "Rebuild image and clip". Rejected because the IMAGE field would stay visible and editable while its edit is ignored.

## Risks / Trade-offs

- [The User edits IMAGE, then chooses Clip only and confirms] → the field is hidden while Clip only is selected, so what is sent matches what is shown. The edit comes back if the User switches back.
- [The stored image file was removed from the project folder by hand] → the video stage reads the image as it does today after a clip correction, and fails as a normal clip failure. No new handling.
- [A legacy skeleton scene with no `IMAGE`] → it is generated by the single stub stage (`launchScene`), which can complete without a stored clip. The store write also requires `video_result IS NOT NULL`, and the page offers Clip only only when the scene has a clip URL. Such a scene therefore gets only the full rebuild.

## Migration Plan

No data change, and no migration. The default scope keeps every existing call unchanged. An installed app needs a new build. Rollback means removing `scope` and the form's choice.

## Open Questions

None.
