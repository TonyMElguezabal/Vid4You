## Why

When the User presses "Rebuild final video", nothing on the page shows that a new version is being built. The button only looks disabled under the mouse. The User cannot tell whether anything is happening, and they can still press "Download final video" and get the old version without noticing.

The cause is in the backend. The ffmpeg assembly runs every step synchronously (`execFileSync`): it normalizes each clip, then does the final encode with subtitles. This blocks the whole Node process until the assembly ends, about 6 minutes for a 70-scene session. During that time:
- the rebuild request itself gets no answer;
- no live update is sent;
- no other request is answered: the session read, images, clips and the page's other commands.

The page already has a "A new version is being built" note, but it can never appear.

## What Changes

- **The assembly no longer blocks the app.** ffmpeg and ffprobe run as asynchronous child processes, so the backend keeps answering requests and sending live updates while a final video is built. This also fixes the first assembly and every assembly retry.
- **The assembly reports its progress.** It has two steps: preparing each clip, then encoding the final video. Each step encodes every frame of the video once, so progress is the share of frames encoded across both steps. ffmpeg reports its frames through `-progress`.
- **The session read carries the progress** while an assembly attempt runs:
  - the step;
  - for the first step, the clips done out of the total;
  - the percentage.

  Live updates send it at most once per second, and on each change of step.
- **The Final video section shows a progress bar** while the final video is being built, for the first build and for a rebuild alike. It shows "Preparing clips: 23 of 70" or "Encoding the final video", the percentage, and "Waiting to start" before the first progress arrives.
- **While a new version is being built, "Download final video" is disabled.** The page says that the download comes back when the new version is ready. A failed rebuild enables it again with the previous version.
- **Rule change:** the scene-rebuild and scene-pause-adjustment specs say that the previous version "stays current and downloadable until the new one succeeds". It stays current, and its route keeps serving it. The page, however, no longer offers its download while a new version is being built.

## Capabilities

### New Capabilities
- `final-video-build-progress`: the progress of a final-video assembly. Covers:
  - its steps and percentage;
  - how the session read and live updates carry it;
  - the Final video section's progress bar;
  - the disabled download while a new version is being built.

### Modified Capabilities
- `final-video-assembly`: a new requirement, "The assembly does not block the app".

## Impact

- **Backend:**
  - `ffmpegAssemblyTool.ts`: asynchronous ffmpeg and ffprobe, and a progress callback;
  - `AssemblyInput` gains an optional `onProgress`;
  - `orchestrator.ts`: keeps the latest progress per session in memory, includes it in the session read, and throttles its broadcast;
  - the session response schema gains `assemblyProgress`, so `docs/api-spec.yml` is regenerated.
- **Frontend:**
  - `FinalVideoDownload`: the progress bar, and a disabled download while a new version is being built;
  - the not-yet-built state also shows the bar;
  - types.
- **No data change:** progress lives in memory only. After a restart, the existing recovery handles the interrupted assembly, and progress starts again with the next attempt.
- **Dependency:** this builds on redo-scene-narration (JOS-282, PR #10), which changed the Final video card. Its branch starts from that branch.
