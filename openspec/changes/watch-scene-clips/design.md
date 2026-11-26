## Context

`sceneToPayload` sets `result.imageUrl` and `downloads.clipUrl`, never `result.videoUrl`. `SceneRow` already renders `<video controls>` for `result.videoUrl`, only in the expanded details, so no clip has ever been shown. The only clip route is `GET .../download/video`, an attachment with no Range support. Clips are stored under the session's project folder (`scenes.video_result`) and are 5 to 15 s MP4 files, usually a few MB. A session can have 60 or more scenes. The page is opened in the User's default browser, which can be Safari.

## Goals / Non-Goals

**Goals:** see each clip on its scene card as soon as it is stored; Play, Pause, Stop; one clip at a time; nothing downloaded until played; works in Safari and Chrome.

**Non-Goals:** the speed-adjusted clip or the narration (that is the final video), a timeline, volume or full-screen control, "play all scenes", changes to the download route.

## Decisions

1. **A new inline route `GET /sessions/:sessionId/scenes/:sceneId/clip`, not the download route.** The download route answers with `Content-Disposition: attachment` and is part of the download contract (`scene-result-downloads`). The new route follows the image route: scoped by (session, scene), confined by `resolveArtefactPath`, no body, read-only.
2. **Range support written in the route, with no new dependency.** Safari does not play a video from a server that ignores `Range`; Chrome needs it to seek, which Stop relies on. `@fastify/static` is not installed and serves directories, not one resolved file. One byte range (`start-end`, `start-`, `-suffix`) is about 20 lines with `createReadStream(path, { start, end })`. A multi-range request is answered with the whole file (200), which the HTTP standard allows. A range starting at or past the end answers 416.
3. **`result.videoUrl` is set from `scene.videoResult`, with the same rebuild query (`?r=N`) as the image.** A rebuilt scene gets a new URL, so the browser does not show the cached old clip. `result` is set when either file is stored.
4. **A `SceneClipPlayer` component, rendered in the card's thumbnail slot when collapsed and at the top of the media column when expanded.** It replaces the static thumbnail and the old `<video controls>` in the details, so a scene never shows two players. The `<video>` has no `controls` attribute (no timeline or volume of our own, as agreed), `preload="none"`, `playsInline`, and the scene image as `poster`. Three buttons call `play()`, `pause()`, and `pause()` then `currentTime = 0`. Button states follow the element's `play`, `pause`, `ended` and `timeupdate` events, so they never disagree with the video. Alternative: native controls plus a Stop button; rejected because native controls add a timeline and volume, and two ways to play.
5. **One clip at a time through a module-level "current clip" in the player component.** When Play is pressed, and again on the `play` event, a player pauses the previously playing scene clip, so two quick presses never leave two clips loading and playing; the AbortError this gives the interrupted start is not reported as a failure. Alternative: a React context in `SessionPage`; rejected as more code for the same result, since only scene clips use it.
6. **Errors:** the `error` event shows `Scene {index} clip could not be played.` in a `role="status"`, and Play stays enabled to try again. A refused `play()` promise (for example a browser blocking playback) is handled the same way, not left unhandled.

## Risks / Trade-offs

- [Expanding or collapsing a card moves the player, which remounts it and loses the position] → acceptable: the clip is at most 15 s; the next Play starts from the beginning.
- [jsdom does not implement media playback] → tests stub `HTMLMediaElement.prototype.play`/`pause` and fire the media events; real playback is checked in a browser (task 6).
- [Safari cannot be driven by the available browser tools] → the Range answers are checked with curl, and the browser test is also run in WebKit (Safari's engine) through Playwright; a check in Safari itself is asked of the User.
- [A stubbed session always has one scene (the stub voice gives 1 s of audio)] → "one clip at a time" is checked by component tests, not in a browser.
- [Repeated code: the image, download and clip routes each repeat the same "find the scene, check the stored path, resolve it in the project folder, check the file exists" steps] → highlighted here; the clip route extracts that lookup into one helper used by the clip and image routes only. The download route is left as it is, to keep this change small.

## Migration Plan

No data change. An installed app needs a new build; until then, nothing changes for the User.

## Open Questions

None.
