## Why

A finished clip can only be downloaded, so a bad clip is found late, often after many more paid clips have been requested (JOS-281). The session page already has a video player, but the session read never sets `result.videoUrl`, so it never appears, and the only clip route is a download that does not answer HTTP Range requests, which Safari needs to play a video.

## What Changes

- The session read and live updates set `result.videoUrl` for every scene with a stored clip.
- A new read-only route serves a scene's stored clip inline, with HTTP Range support.
- The scene card shows the clip, with Play, Pause and Stop controls, as soon as it is stored, without opening the details and without a reload.
- Only one scene clip plays at a time. A clip is downloaded only when the User plays it.
- The expanded details no longer show a second, separate clip player.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scene-detail-view`: the session read points at a stored clip; the clip is served inline; the scene card plays it with Play, Pause and Stop.

## Impact

- Backend: `backend/src/orchestrator.ts` (`sceneToPayload`), `backend/src/routes.ts` (new clip route), tests.
- Frontend: `frontend/src/components/SceneRow.tsx`, a small player component, `frontend/src/styles/app.css`, tests.
- Docs: `docs/api-spec.yml` (new route), `docs/frontend-standards.md` (accessible names). No database change.
- The download route is unchanged.
- Non-goals: playing the speed-adjusted clip or the narration, a timeline, volume or full-screen control, "play all scenes".
