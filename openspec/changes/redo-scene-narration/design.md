## Context

**The narration is locked.** `voice_overs` and `narration_timestamps` hold one record per session, with triggers that block update and delete. Everything after the voice-over reads them:
- decomposition and segmentation;
- the scene intervals, which are locked too;
- the pause dial (`sessionPauses.loadSessionPauses`);
- the subtitles (`assemblySubtitles.buildAssemblySubtitles`);
- the assembly, which muxes `voice-over.mp3` with `-c:a copy`, or encodes AAC once when there are pause edits (`ffmpegAssemblyTool.buildMuxArguments`).

**Scene boundaries.** Under D11 (PRD §7.3), a scene's interval starts exactly where its speech starts. The pause after the speech belongs to the scene.

**Staleness.** `runs.final_video_stale` means "the final video predates a rebuilt scene". Before this change, `triggerAssemblyIfReady` used it to rebuild automatically once every scene was complete (see Decision 15, which removes that).

**The manual fix (2026-11-26, JOS-282).** A one-sentence take spliced between the original sentences sounded cut. The intonation did not follow, and the added pauses were noticeable. A take of scenes 1 and 2, sent with the following text as context, fitted with a 2% speed change and joined once in a −63 dB pause, could not be told from the original. ElevenLabs `/with-timestamps` returns character timestamps for exactly the text sent.

**Starting point.** `watch-scene-clips` (JOS-281, PR #9, not merged yet) added byte-range serving for clips. Safari needs it to play media, including audio.

## Goals / Non-Goals

**Goals:**
- redo consecutive scenes as one take;
- a quote and confirmation before any cost;
- inaudible joins, with the narration's exact length kept;
- review before keeping;
- a final-video rebuild that the User starts after checking the scenes (Decision 15);
- nothing overwritten;
- takes counted in the reports.

**Non-Goals:**
- editing the script;
- a different voice, model or speed for a section;
- scenes that are not consecutive;
- automatic retries of a take;
- re-running decomposition;
- changing intervals or clips;
- a waveform editor;
- downloading a take.

## Decisions

1. **A take is not a pipeline stage. It is its own record, `narration_takes`.**
   - Pipeline stages (`ATTEMPT_STAGES`) are enumerated by the launch gate, held work, diagnostics, the failed-stage report, restart recovery and the retry scheduler. A take differs from all of them: it is confirmed by the User, never retried automatically, and never part of the session's state.
   - The take row records its own `sent_at`, `finished_at`, `provider_id`, `provider_outcome` (success, transient, not-retryable, timed-out) and `provider_request_id`.
   - The call holds a voice slot with `concurrency.acquire("voice", takeId, …)`, so the voice cap (4, below ElevenLabs' 5) still bounds every voice request.
   - The call is limited by the voice phase's time limit through a race with a timer; a late answer is dropped.
   - Alternative considered: a seventh attempt stage. Rejected, because each of those enumerations would need a "not this one" exception.

2. **One "current narration" resolver.**
   - `currentNarration(runId)` returns `{ version, audioPath, timestampsPath, mechanism, durationSeconds, spliced }`:
     - the original `voice_overs` and `narration_timestamps` records when no take is kept;
     - otherwise the latest kept take's files.
   - Only the three readers that run after scenes exist switch to it: the assembly's audio, `loadSessionPauses` and `buildAssemblySubtitles`.
   - The decomposition, timestamps phase and voice launch guard keep reading the original records. They run before any take can exist.
   - The locked tables and their triggers are untouched.

3. **The fit is planned from character timestamps. No acoustic silence detection.**
   - The take's characters are matched to the selected scenes' `PROMPT` spans with the same fragment location that `derivePauses` uses (`locateFragment`, exported for this).
   - For each scene, a pure function `planTakeFit` derives:
     - the speech span `[s, e]` and the take's own pause after it;
     - the target interval length `L`;
     - the scene's pause before the take, which sets the cap `max(3.0, pause)`.
   - The function returns a plan, or the first scene that does not fit:
     - **Pause first:** with speed 1.0, the pause is `L − (e − s)`. If it lies in `[0.2, cap]`, the speed stays 1.0.
     - **Then speed:** otherwise the tempo is the least change that brings the pause back inside the bounds. If that change exceeds 5%, the take does not fit. The "too long" or "too short" amount is stated at normal speed.
     - **Cuts:** each scene part is cut from 50 ms before `s` (less if the take has less silence there) to the middle of the take's following pause. It is placed so that `s` lands on the interval's start, and its pause is changed at the middle, like `buildNarrationFilter`.
   - A second pure function turns the plan into one ffmpeg filtergraph: `atrim`, `atempo`, `anullsrc`, `afade` 10 ms on the take's side only (the base stays untouched), `concat`. The graph covers base `[0, A−lead)`, the fitted parts, and base `[B−lead, end)`, where A and B are the section's interval bounds.
   - The output is checked for an exact sample count against the decoded base narration.
   - Every part ends at or before the base's last decoded sample. The last scene's interval ends at the MP3's reported duration, which includes the encoder padding (32 ms in a 12-minute session, found by a take of scene 62 on 2026-11-27). Without the limit, a section reaching the end would be that much longer than the base, and the length check would reject it.
   - Alternative considered: `silencedetect`. Rejected, because it depends on a threshold, while the timestamps already give the speech spans and the cuts sit outside them.

4. **The spliced narration is stored as FLAC and encoded once at the mux.**
   - Re-encoding the whole narration to MP3 would add a lossy generation every time a take is kept.
   - Splicing MP3 frames breaks across the bit reservoir.
   - FLAC is lossless, about 25 MB for 12 minutes of mono, and every ffmpeg build decodes it.
   - The mux already has an "encode once (AAC 192 kbps) and measure" path for pause edits. `AssemblyInput` gains `encodeNarration`, and the path is taken when the narration is spliced or has edits. The original MP3 with no edits is still copied, so ADR 0005 Decision 4b holds for every session without a kept take.

5. **Volume matching.**
   - ffmpeg `astats` measures the RMS level of the take's speech spans, and of the base narration's speech spans in the replaced section, from the character timestamps.
   - The gain is their difference, limited to ±6 dB, and lowered if needed so the peak stays at or below −1 dBFS.
   - The existing `voiceLevel.ts` tools (ffmpeg runner, `astats` parsing) are reused; no new dependency.

6. **The text, the context and the adapter.**
   - The text is the script's characters spanning the selected `PROMPT`s.
   - The context is up to 1,000 characters on each side, cut at a whitespace.
   - `VoiceSynthesisRequest` gains optional `previousText` and `nextText`. The ElevenLabs adapter sends them as `previous_text` and `next_text`, and is otherwise unchanged (`with-timestamps`, `apply_text_normalization: "on"`).
   - The bound profile's parameters are read with the same `voiceParametersFor` as the voice phase (exported).
   - A provider without timestamps fails the take, as not usable. Forced alignment of a take is out of scope: the only real voice adapter returns timestamps.
   - The stub voice adapter answers a request that carries context with silent audio of its configured length and timestamps spread over its first 75%. That lets stubbed sessions (one 1 s scene) fit a take in tests and E2E.

7. **Keeping a take.**
   - One transaction, with no `await` inside, checks four things:
     - the take is `ready`;
     - its `base_version` equals the current version;
     - no assembly is in flight;
     - no rebuild is requested.
   - It then sets `kept` and `decided_at`, deletes the pause edits of the take's scenes, and sets `final_video_stale = 1` when a final video exists.
   - After commit, the session is broadcast. No assembly is launched (Decision 15).
   - The stale flag now means "the final video predates the current scenes or narration". It makes "Rebuild final video" acceptable, and the page offers that action and explains why.
   - Alternative considered: recording the narration version in `final_video_builds`. Rejected: the flag already drives every behaviour.

8. **Data model: `narration_takes`.** A new migration creates it with these columns:
   - `id`, `run_id`, `number` (unique per run), `base_version`;
   - `first_scene_id`, `last_scene_id`, `text_length`, `provider_id`;
   - `state`: generating, ready, kept, discarded, or failed;
   - `provider_outcome`, `provider_request_id`, `failure`;
   - `take_audio_path`, `take_timestamps_path`, `narration_path`, `narration_timestamps_path`, `preview_path`;
   - `requested_at`, `sent_at`, `finished_at`, `decided_at`.

   Rules on the table:
   - A partial unique index on `run_id WHERE state IN ('generating','ready')` makes "one open take per session" a store rule, so two quick clicks cannot both be accepted.
   - Triggers block delete, and block any update of a row whose old state is kept or discarded.
   - Files are written with `writeArtefactOnce` as `narration-take-<n>.mp3`, `narration-take-<n>-provider-timestamps.json`, `narration-take-<n>.flac`, `narration-take-<n>-timestamps.json` (stored-file shape, original mechanism) and `narration-take-<n>-preview.m4a`.
   - The version of a kept take is one more than the number of kept takes before it.

9. **Routes.**
   - The routes are:
     - `GET …/narration-takes/quote` (no side effects);
     - `POST …/narration-takes` (202);
     - `GET …/narration-takes/:takeId/preview`;
     - `POST …/narration-takes/:takeId/keep`;
     - `POST …/narration-takes/:takeId/discard`.
   - Zod schemas cover every body, query and answer, with the existing `conflictSchema` shape for refusals. The OpenAPI contract is regenerated from `app.swagger()`.
   - The clip route's byte-range answer (200/206/416, `Accept-Ranges`) is extracted into `sendFileWithRanges(reply, path, contentType, rangeHeader)` and used by both routes.

10. **Read model.**
    - `SessionEventPayload` gains `narration: { version, take?: { takeId, state, firstSceneIndex, lastSceneIndex, previewUrl?, failure? } }`.
    - Each scene gains `narrationRedone` and `narrationRedoable`. `narrationRedoable` is true when its `PROMPT` is located in the current timestamps.
    - The quote is the only answer that carries script text, and logs carry ids, lengths and outcomes only.

11. **Restart.** Boot marks every `generating` take `failed` with "The app restarted before the new reading arrived. Try again." It never resends: the provider may already have billed it.

12. **Reports.**
    - `readCountedAttempts` adds the takes that were sent and finished, as voice attempts of their provider, through a `UNION ALL`. Units are `text_length` when `provider_outcome = 'success'`.
    - The estimated-cost and sessions reports read the same rows, so they include takes with no further change.

13. **Frontend.**
    - **`SceneRow`:** an inline "Redo narration" form, like Rebuild scene. It has a "Through scene" `<select>` of this and later scenes, and the quote is fetched on each change.
    - **`NarrationTakePanel`:** shown in `SessionPage` above the final video. It uses `<audio controls preload="none">`; native controls suit a review, and the timeline helps.
    - **Card badge:** "Narration redone".
    - The panel and the action are derived from state; nothing is rendered and then disabled.

14. **Product limits, each a named constant with its decision comment:**
    - 2,500 characters per take;
    - ±5% speed;
    - pause bounds 0.2 s and `max(3.0 s, original)`, the same as the pause dial;
    - 50 ms lead;
    - 10 ms fades;
    - 1,000 characters of context;
    - 3 s of preview context;
    - ±6 dB gain.

15. **No automatic rebuild of an existing final video.**
   - A rebuilt section must be checked before it reaches the final video. The User may want to rebuild other scenes, redo a narration again, or adjust pauses first, and each automatic rebuild costs minutes of encoding.
   - `triggerAssemblyIfReady` launches a session that has a final video only when a rebuild was requested (`rebuild_requested_at`, set by `rebuildFinalVideo`). A stale final video alone launches nothing.
   - The assembly launcher's held work no longer counts a stale final video, so continue does not rebuild it. Boot already ignored it.
   - `rebuildWhenReady` is removed: keeping a take only marks the final video stale.
   - `rebuildFinalVideo` refuses with `take-in-progress` while a take is `generating` or `ready`, checked from the store before the request is recorded. Together with `take-in-progress` on create and `assembly-in-progress` on keep, an assembly never runs while a take is open.
   - A session with no final video keeps its automatic first assembly, including after a scene rebuild in a session failed at assembly.
   - The page: `FinalVideoDownload` hides "Rebuild final video" while a take is open and says "Keep or discard the new narration before rebuilding the final video." While the final video is stale, it says "This version predates your changes. Check every scene, then rebuild the final video."
   - Alternative considered: keep the automatic rebuild and only hold it while a take is open. Rejected: the User asked to check every rebuilt section first, for scene rebuilds too.

## Risks / Trade-offs

- [The provider bills a take that then cannot be fitted] → the quote says the reading is billed. The take counts as a billed voice attempt, and its cause says exactly what did not fit.
- [A take sounds different from the original (provider variation)] → the User listens before keeping, and discarding changes nothing.
- [A speed change up to 5% could be audible on some voices] → the speed changes only when the pause cannot absorb the difference. The manual fix used 2%.
- [The decoded MP3's sample count differs from its measured duration (encoder delay)] → the splice keeps the decoded sample count. The mux measures audio against video and fails the attempt beyond one frame, as for pause edits.
- [Disk use, about 25 MB per take of a 12-minute narration] → accepted; nothing is overwritten by design.
- [The take changes the pause the dial derives for the redone scenes] → their edits are reset on keep and the confirmation says so. Other scenes keep theirs.
- [Repeated code: matching script text to timestamp characters already exists in three places: `scenePause.ts` (`locateFragment`), `sentenceTimings.ts` (`sentenceSpeechSpans`) and `subtitles.ts` (`timedWords`)] → highlighted. This change exports `locateFragment` and reuses it rather than writing a fourth copy. Merging the three is left out, to keep this change small.
- [Dependency on PR #9 for byte ranges] → Step 0 branches from `main` once PR #9 is merged, or from its branch, rebasing after the merge.

## Migration Plan

One new migration adds `narration_takes`. There is no backfill, and existing sessions read as narration version 1 with no take. Rolling back to an older build leaves the table unused. A session with a kept take would then be assembled from the original voice-over, which is still intact.

## Open Questions

None blocking. The product limits in Decision 14 are defaults taken from the manual fix and the pause dial. The product owner can change them in one place.
