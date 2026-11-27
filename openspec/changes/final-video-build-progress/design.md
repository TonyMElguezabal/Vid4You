## Context

`createFfmpegAssemblyTool().assemble()` in `ffmpegAssemblyTool.ts` is declared `async` but contains no `await`. Every call is `execFileSync`:
- `probeVideoDuration` and the other ffprobe helpers;
- one ffmpeg run per clip, to retime and normalize it (stage 1);
- one ffmpeg run that concatenates the normalized clips, adds the narration and burns in the subtitles (stage 2).

`runAssemblyAttempt` in `orchestrator.ts` calls it, and so do the rebuild, retry and restart paths through `assemblyStageLauncher.launch`. Once the tool is entered, Node's event loop is blocked until it returns.

On the User's 70-scene session, the rebuild took 6 min 10 s (stage_attempts, 19:37:39 → 19:43:49). `rebuildFinalVideo` calls `launch` before `broadcast` and before the route answers, so the 202 and the "rebuilding" live update arrived only at the end.

On the page, `FinalVideoDownload` already hides "Rebuild final video" and shows "A new version is being built" while `rebuilding` is true. `rebuilding` is `session.state === "final-video-generating" && finalVideoUrl`, derived from an in-flight assembly attempt. The page is right; it just never received the update in time.

The other `execFileSync` in `backend/src` is `stubClipMaker` in `videoProvider.ts`, used only by the stub video provider. The narration take tools already use asynchronous calls.

## Goals / Non-Goals

**Goals:**
- the backend keeps answering while an assembly runs;
- a progress bar for every final-video build, with a percentage that reflects the actual work;
- the download is disabled while a new version is being built.

**Non-Goals:**
- A time estimate ("about 3 minutes left"). The percentage is enough, and an estimate would need history.
- Cancelling a build.
- Making the per-clip normalization faster, for example by running it in parallel or skipping it when a clip is unchanged. That is worth doing later; it changes what ffmpeg is asked to do, not how the User sees it.
- The stub clip maker, which is dev-only.

## Decisions

1. **Asynchronous child processes, with `-progress pipe:1` for the two encode steps.**
   - ffprobe calls use `promisify(execFile)`, so the call sites barely change.
   - The two ffmpeg encodes use one small helper, `runFfmpeg(args, { cwd, onFrame })`. It `spawn`s ffmpeg with `-progress pipe:1 -nostats`, reads `frame=N` lines from stdout, and calls `onFrame(N)`. It collects stderr, and on a non-zero exit rejects with an `Error` that carries stderr, as `execFileSync` did. So the existing `catch` still turns any failure into `failed_transient` with ffmpeg's message.
   - Alternative: `execFile` with no progress. Rejected: it fixes the freeze but gives the bar nothing to show while encoding.
   - Alternative: a worker thread around the existing sync calls. Rejected: more moving parts for the same result.
2. **Progress is the share of frames encoded, over both steps.** Stage 1 encodes each clip's `frameCount` frames once. Stage 2 encodes all of them once more, with the subtitles. The total is `2 × Σ frameCount`.
   - `done` is the frames of the finished clips plus the current clip's reported frames in stage 1, then `Σ frameCount` plus the reported frames in stage 2.
   - `percent = min(99, floor(100 × done / total))`. A reported frame count above the target is capped, and `percent` never decreases within an attempt.
   - Both steps encode the same number of frames, so the bar moves at roughly the same speed through them. A fixed 50/50 split by step would be the same, and is what this is.
   - Alternative: count clips only. Rejected: the final encode is a single long run, and the bar would stop at "70 of 70" for minutes.
3. **`AssemblyInput.onProgress?(progress: AssemblyProgress)`**, where `AssemblyProgress` is `{ step: "preparing-clips" | "encoding"; clipsDone: number; clipsTotal: number; percent: number }`.
   - The tool calls it at the start of each clip, after each clip, at the start of stage 2, and on every frame report.
   - The stub assembly tool reports through the same tracker. In `success` mode it reports each clip and the encode at once. In `slow-success` mode it spreads them over its delay: half for the clips, half for four encode reports. The Playwright backend uses `slow-success` with `ASSEMBLY_STUB_DELAY_MS=2000`, so the browser test can see the bar. This adds about 2 s to each assembly in that suite, and the suite's other tests already wait up to 60 s for a final video.
   - The ffmpeg tool owns the arithmetic. The orchestrator only stores and forwards.
4. **The orchestrator keeps the latest progress in a `Map<runId, AssemblyProgress>`.**
   - It is set by `onProgress` and deleted when the attempt ends, whatever the outcome, in a `finally`.
   - It broadcasts when the step changes, and otherwise at most once per 1,000 ms per session, using a stored last-broadcast time. No timer.
   - The session read sets `assemblyProgress` from the map. In memory only, as the progress is meaningful only while this process runs the attempt. A restart loses it with the ffmpeg process itself, and the existing restart recovery decides what happens to the attempt.
5. **The page.**
   - `FinalVideoDownload` gains `progress?: AssemblyProgress` and a `building` state, which covers the first build as well as a rebuild:
     - `building` is `session.state === "final-video-generating"`;
     - `rebuilding` is `building` with a `finalVideoUrl`, as today.
   - While `building`, it renders a native `<progress max={100} value={percent}>` named "Final video progress", with the percentage as text, and the step line from the spec. With no progress yet, the line is "Waiting to start" and the `<progress>` has no `value`, so it shows as indeterminate.
   - While `rebuilding`, the download is a `<button disabled>` with the same icon and text, followed by the note. A link cannot be disabled, and a disabled button keeps its accessible name.
   - The existing "A new version is being built. The previous version stays available." is replaced by the note from the spec.
   - Native `<progress>`, styled with the existing tokens, needs no new dependency, and screen readers know it.

## Risks / Trade-offs

- [ffmpeg's `frame=` counts output frames, and the per-clip `-frames:v` cap makes it exact in stage 1. In stage 2 the count can lag at the start, or skip.] → the percentage is capped at 99 and never decreases, so the bar moves forward only.
- [A large stdout buffer] → `-progress` writes a few short lines about twice a second, and the helper keeps only the last `frame=` value. stderr is collected only for the error message, with `-loglevel error`, as today.
- [The scene list's live updates during an assembly] → a broadcast at most once per second per session. The page already handles updates of that size.
- [The progress is lost on restart] → the bar shows "Waiting to start" if the assembly is relaunched, and disappears if it fails. Both match what is happening.

## Migration Plan

No data change, and no migration. An installed app needs a new build. Rollback means reverting to `execFileSync`; nothing stored depends on the progress.

## Open Questions

None.
