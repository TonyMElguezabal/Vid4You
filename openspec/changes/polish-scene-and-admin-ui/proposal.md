## Why

The session page and `/admin` grew one story at a time, and they now look unfinished. On a scene card, Play, Pause and Stop are three labelled buttons that wrap onto two rows, taller than the rest of the card, and two of them are always disabled. An opened scene shows the same picture twice, prints raw values such as `1.0159166666666668`, stretches the pause field across the column, and stacks every action on its own row. On `/admin`, sections use a form-field layout, so everything is pushed against the left edge, and the failed-stage list is a bulleted list with whole sentences as button labels. The User reviewed working mockups of a refresh (https://claude.ai/artifact/Vc8e7bHSRasASiJz3Lw4AB) and chose how it should behave.

## What Changes

- **BREAKING (page behaviour):** Play and Pause become one button, named after what it does next (`Play scene 4 clip` / `Pause scene 4 clip`, `Play voice-over` / `Pause voice-over`). Stop is shown only once playback has left the start, instead of being disabled. Stop shows the scene image again. This applies to the scene clips and the voice-over.
- On a scene card, the player sits over the picture as one small control bar. The scene number stays in the status line, as `watch-scene-clips` requires.
- An opened scene shows one picture, the image, which plays the clip in place. It never shows the image and the clip's cover image together.
- At most one scene is open: opening a scene closes the one that was open, and the opened card scrolls into view.
- Opened scene: the requested duration is shown in seconds and the speed factor to two decimals. Retry, Rebuild scene (with its existing "Clip only, keep the current image" choice) and Redo narration sit together in one bar under the details. The pause field keeps its intended width, with the unit inside it.
- Buttons get three weights (main, normal, quiet). Native dropdowns keep their behaviour and get a drawn arrow with room on the right.
- `/admin`: each section has a heading row; the active providers line up in columns, with the source as plain text; provider rows and failed-stage rows show short visible labels ("Edit", "Move") and keep their full accessible names; the charged-test prompt and test results are notices.
- Every accessible name in `docs/frontend-standards.md` stays the same, except that the Play/Pause pair is now one element whose name changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scene-detail-view`: the clip player has a Play/Pause toggle and a Stop shown once playback has left the start; an opened scene shows one picture; at most one scene is open at a time.
- `voice-over-playback`: the voice-over player has the same Play/Pause toggle and Stop.
- `clip-duration-request`: the requested duration is shown in seconds and the speed factor to two decimals.
- `admin-page-layout`: active providers show their source as text in aligned columns; provider rows show short visible labels; failed stages are compact rows.
- `visual-design`: buttons have three documented weights, and native dropdowns have a drawn arrow from the token set.

## Impact

- Frontend only: `MediaPlayer.tsx`, `SceneClipPlayer.tsx`, `SceneList.tsx`, `SceneRow.tsx`, `PauseDial.tsx`, `ActiveProvidersSection.tsx`, `ProviderProfilesSection.tsx`, `FailedStagesSection.tsx`, `VisualStyleSection.tsx`, `styles/app.css`, `styles/tokens.css`, and their tests. The Playwright tests `e2e/tests/scene-clips.spec.ts` and `e2e/tests/voice-over-player.spec.ts` change with the player.
- No backend, API or database change.
- Docs: `docs/frontend-standards.md` (accessible names, button weights, dropdown arrow token).
- Order: this change modifies requirements added by `watch-scene-clips` (`scene-detail-view`) and `listen-to-voice-over` (`voice-over-playback`). Both are complete but not archived, so they must be archived before this one.
- Base: built on `UAT`, which holds `listen-to-voice-over`, `rebuild-scene-clip-only` and `final-video-build-progress`, because all three change `SceneRow.tsx`.
- Non-goals: changing the clip-only rebuild (delivered by `rebuild-scene-clip-only`; only its place on the card changes); a timeline, volume or full-screen control; restyling the reports tab or the start page beyond the dropdown arrow.
