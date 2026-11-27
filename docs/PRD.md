# PRD — Vid4You

**Version:** 1.0  
**Scope:** MVP  
**Status:** Approved

The MVP is a single-user application on the user's own computer, and all product decisions are closed.

## 1. Product goal

Vid4You is a web application that turns a script provided by the user into a narrated video, as a horizontal 16:9 MP4.

The system generates a complete narration, divides the script into scenes or *chunks*, generates one image and one clip per scene, fits the clips to the narration and assembles the final video. Processing advances automatically, except when the user has requested a pause or a failure prevents it from continuing.

The user can follow progress by phase and by scene, download the results that are available and recover failed generations without changing the narrated content.

## 2. Users and scope

### 2.1 Roles

| Role | Responsibility |
|---|---|
| User | Enter a title, a script, and the script's language; follow progress and per-scene diagnostics; pause and continue the session; download results; retry failed stages. |
| Administrator | Unlock `/admin` with the Administrator password; add, edit and delete the providers of each stage, their parameters and their API keys; change the active provider of each stage there, and move a failed stage to the current active provider (§11.2); set the visual style of new sessions (§11.5); see the reports of §11.4; test a saved provider's connection (§11.2). Further Administrator tools are added by later stories. A User never needs the password. |

The operational settings (§11) are read at start-up from local settings files: a default file that ships with the application and an optional per-user file that overrides it. A change takes effect after the application restarts, and these settings are edited by hand, not through the application. The providers are the exception: the Administrator adds, edits and deletes the providers of each stage, their parameters and their API keys, and chooses each stage's active provider, all on `/admin`, and these apply without a restart (§11.2). The product has two roles. The User needs no login. The Administrator unlocks `/admin` with one shared password, not an account. The password is a local secret, read from `ADMIN_PASSWORD` in the process environment or, when the environment has none, from the credentials file in the user's application-data folder; it is never part of a settings file, never part of the application download, and never shown in the interface, a response or a log. When no password is configured the application still starts, and `/admin` says so and explains how to set one. `/admin` is not linked from the User's pages. A provider's API key is entered on `/admin` and stored encrypted in the local database; it is never part of a settings file, never part of the application download, never returned by the application after it is saved (only its status and its last four characters) and never shown in a log. A key given in the process environment or in the credentials file in the user's application-data folder keeps working for the providers created from the first settings, until a key is stored for them. Other Administrator tools (diagnostics on `/admin`) are deferred post-MVP.

### 2.2 Included in the MVP

- Creating sessions from a title and a script.
- Generating a single voice-over per script.
- Obtaining the narration interval of each fragment within the complete audio.
- Automatic decomposition into chunks and creation of their visual instructions.
- Generating one image and one clip per chunk.
- Synchronizing the clips with the audio and assembling the final MP4.
- Showing progress, results and errors.
- Pauses before a phase is launched, and explicit continuation.
- Partial downloads (per-scene images and clips, §12.3) and download of the final video.
- Automatic and manual retries after failures.
- Correcting the visual prompt of a failed stage.
- Visual style setting on `/admin`: one prompt, and an optional reference image that is sent to the image provider with every scene of the sessions created afterwards (§11.5).
- Persistence of sessions, states and results.

### 2.3 Outside the MVP

- A video provider that neither a shipped adapter nor a configured connector can describe (§11.2): it needs a coded provider of its own.
- User accounts, authentication and authorization, any multi-user access, and any hosted (server) deployment. The MVP is an application that runs on the user's own computer (§12.3).
- Importing chunks or editing them freely.
- Rewriting the script or regenerating a narration that is already complete.
- Regenerating successful images or clips for aesthetic preference. A defect the user sees in a generated scene (wrong content, wrong text inside the image, artefacts) is not an aesthetic preference: it is a failure the system did not detect, and it is recovered as §10.3 describes.
- Cancelling requests already sent to a provider.
- Assemblies that leave out scenes of the script.
- Changing an operational setting from the application (interface or API) and applying one without a restart (§11). The providers, their parameters and keys, and the active provider are the exception (§11.2).
- Any automatic provider change; more than one Administrator, user accounts, changing the password from the interface, login sessions and lock-out after failed attempts.
- Session expiry (§12.2).
- Size or budget limits per session (§4.1).
- A product-level content policy; providers' own content filters apply (§4.1).

## 3. Project concepts and data

A **session** represents a video project and has an identifier generated by the system. It holds the title, the script, the narration, the chunks, the progress and the results. The data of different sessions stays separate, even when their titles are the same. The session also stores the script language selected by the User (§4.1).

The **script** is the user's original text. The system uses it as the content of the narration and as the source of the scenes; it does not rewrite it.

The **voice-over** is a single MP3 file containing the complete narration of the script. Chunks relate to intervals of that audio; they do not require generating separate voices.

The **timestamps** place each fragment of the script within the voice-over. How they are obtained is defined in §11, and they are a precondition of the decomposition.

A **chunk** is a scene and holds, at least:

| Field | Content | Editable by the user |
|---|---|---|
| `ID` | Sequential number assigned by the system. | No. |
| `PROMPT` | Fragment of the script narrated in the scene. | No. |
| `IMAGE` | Instruction to generate the image. | Only after that image's generation fails. |
| `VIDEO` | Instruction to animate the image. | Only after that clip's generation fails. |
| Narration interval | Position and duration of the scene in the complete audio, per §6.1 and §7.3. | No. |
| Requested duration and speed factor | Duration requested from the provider and the resulting speed factor, per §7.2 and §7.3. | No, except when the Administrator moves a failed clip to another video provider (§7.2, §11.2). |
| State and results | Progress, image, clip and error, when applicable. | Updated by the system. |

Each stage keeps the identification of the provider used and the attempts made. This information makes failures diagnosable without exposing credentials or confidential data. It is shown to the User in each scene's details (image and clip stages) and in each phase's section (session-level stages). While a scene's clip is generating, its details also show the clip request (`show-video-request-status`, JOS-200): the provider and the attempt, when the request was sent, the time elapsed (updated live) and an estimated arrival, calculated as the median generation time of the provider's earlier successful clips (those of the same requested duration when there are at least three) and labelled as an estimate, or "no estimate yet" when there is none; the User can open the request body as sent (prompt, duration and resolution, with the first frame named as the scene's image). The provider's addresses, request identifiers and credentials are never shown. The clip line counts the attempt in flight from the moment its request is sent.

## 4. Content input and preservation

### 4.1 User input

The user enters a non-empty title and a non-empty script. They do not need to provide identifiers, tags, delimiters, or image or video instructions.

The User also selects the script's language from the configured list of supported languages (§11; shipped default §11.3: **English, Spanish**). Only supported languages can be chosen, and a project cannot start without a selected language; no provider is called before that.

The product sets no functional word limit. A script of about 1,500 words is a common reference, not a restriction or a required duration. The video's duration depends on the actual narration of the script. The MVP sets no limit on script words, number of scenes, or provider calls per session.

Under the script field, the start form shows the script's word count and an estimated video duration (at 150 words per minute, in `~m:ss` format). It is informative only: it does not block or change the submission, adds no limit, and the script does not leave the page to calculate it. The actual duration is set by the narration (§7.3).

If a service restriction prevents the content from being processed, the system reports the cause. It does not trim or summarise the script to make it fit silently.

The MVP has no product-level content policy: providers' own content filters decide. The script is checked at submission by the reasoning provider's moderation endpoint (§11.3, JOS-187) before the project exists: a flagged script is refused with the flagged categories named, nothing is created, and the script stays in the form to be edited and resubmitted. If the check cannot run, the submission is refused as temporarily unavailable and nothing is created; a script is never registered unchecked. A rejection later in the pipeline is a not-retryable failure (§10.1). Because the script is locked at project start (§4.2), a rejected script requires starting a new project; rejected `IMAGE` or `VIDEO` instructions can be corrected (§10.3).

### 4.2 Fidelity and immutability

- The narration must match the complete script provided by the user.
- The script is locked as soon as the User starts the project (from `submitted` onward), including while the session is paused and after a voice failure. Once the voice-over has been generated successfully, the audio cannot be regenerated within that session.
- The decomposition cannot add, remove, duplicate, summarise or paraphrase narrative content.
- The chunks' fragments, joined in order, must rebuild the original script. Only the whitespace between them may be normalised, without changing the content.
- Creating visual instructions is not a change to the script.
- Retrying a failed voice generation before a valid audio exists is not the same as regenerating a completed narration.

## 5. Functional flow

1. The user provides the title and the script and starts the project.
2. The system registers the session and generates the complete voice-over.
3. With the audio available, it obtains its timestamps per §11.
4. It divides the script into chunks by the rule of §6.1 and assigns each fragment its narrated interval.
5. It assigns the identifiers and generates the `IMAGE` and `VIDEO` instructions.
6. It generates each chunk's image.
7. When the image is available, it generates the clip from that image and the `VIDEO` instruction.
8. When every chunk is complete, it fits the clips to their narration intervals and joins them in order.
9. It adds the complete voice-over and produces the final MP4.
10. It marks the session `final-video` when the final file is finished and available to download.

Steps 3 and 4 belong to the same decomposition phase and share its state and its retry policy.

A scene can finish without the other scenes having finished. The assembly can start only when all of them are complete. Available results can be downloaded during processing.

## 6. Chunks and narrative order

The system assigns consecutive numeric identifiers from **1 to N**, in the order the fragments appear in the original script.

Identifiers are unique within the session and do not change during processing or retries. The same identifier can exist in different sessions.

Presentation and the final assembly follow the ascending numeric order of the identifiers, whatever the order in which the generations finish. If chunk 3 finishes before chunk 2, the assembly keeps the order 1, 2, 3.

Every chunk must have its four content fields complete: `ID`, `PROMPT`, `IMAGE` and `VIDEO`. An invalid structure generated by the system is a decomposition failure, not a formatting error in the script the user entered.

Once established, chunks cannot be split, merged, deleted or reordered by the user. Retries keep the scene's identity and narrative content.

### 6.1 Segmentation rule

Segmentation runs after the voice-over and its timestamps are available, so the system knows the narrated duration of each candidate before it fixes the cuts.

- **Cut criterion.** Cuts fall on sentence boundaries. A chunk groups one or more complete consecutive sentences.
- **Upper bound.** A chunk's narrated duration does not exceed the maximum duration admitted by the active video provider.
- **Lower bound.** A chunk's narrated duration does not fall below the configured lower bound. A sentence that does not reach it is grouped with the following sentence; if it is the script's last sentence, it is grouped with the previous one (see §6.1.1 for edge cases).
- **Exception.** A sentence whose narration alone exceeds the upper bound is split at a clause boundary, marked by a comma, a semicolon or a conjunction. This is the only split allowed inside a sentence.
- **Optimisation.** Among the groupings that meet both bounds, the system prefers those whose narrated duration is closest to a duration the video provider admits, to reduce the speed adjustment of §7.3.

The rule does not change §4.2: the fragments joined in order still rebuild the original script.

The lower bound exists because the video provider imposes a minimum clip duration. Without it, a very short fragment would force a high speed-up factor. Its value is configured (§11.3: shipped default **5 seconds**) and matches the shortest duration admitted by the video provider, by construction.

A system-generated decomposition that breaks these rules is a decomposition failure, not an error in the script the user entered.

#### 6.1.1 Edge cases

- **Script shorter than the lower bound.** If the whole script's narration is below the lower bound, it becomes a single chunk below the lower bound. Its clip is requested at the shortest admitted duration and sped up to fit (§7.2).
- **Short sentence whose grouping would exceed the maximum.** If a sentence below the lower bound would exceed the upper bound when grouped with the following sentence, the following sentence is split at a clause boundary (comma, semicolon, or conjunction) and its first part is grouped with the short sentence. This extends the clause-boundary exception to sentences that do not exceed the upper bound on their own.
- **Sentence that cannot be split.** If a sentence must be split (it exceeds the upper bound on its own, or it is the following sentence in the previous case) but has no comma, semicolon, or conjunction, it is kept whole in one chunk even if that chunk exceeds the upper bound. Its clip is requested at the maximum admitted duration and slowed down to fit, and a speed-factor warning is recorded; it is not a failure.

## 7. Visual generation, duration and assembly

### 7.1 Image

Each chunk uses its `IMAGE` instruction to generate a horizontal 16:9 image with a minimum resolution of 1920 × 1080. The clip cannot be requested without an available image.

### 7.2 Clip

Each clip uses the generated image and the `VIDEO` instruction. The requested duration is calculated from the duration of the corresponding interval in the voice-over, within the values the provider admits.

- The system requests the admitted duration **closest** to the narrated interval. The requested duration may be shorter than the interval, which means slowing the clip down during assembly. "Closest" means the admitted duration requiring the smallest speed change (speed-up or slow-down ratio) to match the interval, not the fewest seconds; an exact tie goes to the longer duration.
- When the narrated interval is shorter than the shortest admitted duration, that shortest duration is requested.
- **Clip check (JOS-265, product owner decision 2026-11-05).** The system measures each generated clip from its own file, before storing it, and does not trust the data the provider reports. A clip is accepted only if it is a readable MP4 whose first frame decodes, if its video is horizontal, wider than tall (orientation; any size, because the assembly scales a smaller clip such as a 768P 1344×768 one up to the output size), and if its measured duration is between the requested duration minus 0.5 s and the requested duration plus 1 s (duration). A clip that fails counts as a transient failed attempt of the video stage, with a readable reason (for example, "the generated clip lasts 6.0 s, but 10 s was requested"), and follows the retry policy of §10.1; when the retries run out, the scene is `failed` at the video stage. If ffprobe cannot run, the attempt fails as not retryable, because a retry could not succeed.
- The system must not assume that every provider admits the same durations, or any intermediate value. The set of admitted durations is configured for the video provider (§11).
- The usual expected maximum is 15 seconds; a provider that admits 20 seconds can use that maximum. **Recorded (§11.3): the video provider's measured admitted range, the shipped default, is 5-15 seconds** — the "usual" 15-second expectation is exactly the measured maximum, not just a placeholder guess.

The §6.1 upper bound ensures that no narrated interval exceeds the video provider's maximum, except for a sentence that cannot be split (§6.1.1). That clip is requested at the maximum admitted duration and slowed down to fit, with a speed-factor warning. No trimming policy is required.

The one exception to the requested duration and the factor being stored once is a failed clip that the Administrator moves to another video provider (§11.2): its requested duration is chosen again from the new provider's admitted durations, by the same rule (the smallest speed change), and its duration warning, speed factor and speed-factor warning follow from it, while the chunk and its narration interval stay unchanged.

The speed factor is not an independent parameter: it results from the segmentation rule of §6.1 and the duration selection described above. The system records the resulting factor for each scene with its result and shows it, with the requested duration, in the scene details. The acceptable limit is configured (§11); when a scene exceeds it, a diagnosable warning is recorded, not a failure.

### 7.3 Synchronization and final assembly

Each clip's duration is fitted to its narration interval by a speed adjustment, which can speed the clip up or slow it down. The audio and the text are not changed to fit the clips.

The chunks' narration intervals form a **partition of the voice-over's timeline**: they are contiguous, do not overlap and cover from second 0 to the total duration of the MP3. This property is a product requirement and holds whatever rule D11 adopts.

**D11 (closed, JOS-142, product owner decision 2026-09-29):** each silence in the narration is assigned to the previous scene — the cut to the next scene happens exactly when its narration starts, not in the middle of the silence. A clip holds up to 2 seconds of silence acceptably; from 3 seconds it starts to feel slow. No real script measured in the comparison (English and Spanish, native and forced-alignment timestamps) exceeded 1.26 seconds, below the threshold, so no third rule is defined. Evidence: `docs/adr/0006-silence-allocation.md`.

The assembly must keep all the narrated content and the sequence of scenes, with no omissions, duplications or visual gaps. It must also cover the pauses in the narration.

**Manual pause adjustment (JOS-190, product owner decision 2026-10-15).** Once the final video exists, the user can shorten or lengthen the silence that follows a scene and rebuild the final video. The silence moves between 0.2 and 3.0 seconds in steps of 0.1 s, further bounded so that the scene's clip does not exceed the speed-factor limit; the initial value is the original pause. The silence is trimmed or extended at the middle of the pause: the speech and its speed do not change, later scenes shift accordingly and the stored MP3 is not modified. Each rebuild writes a new file (`final-video-<version>.mp4`, version 2 onward) and keeps the earlier ones; no clip is generated again, and neither the chunks' stored intervals nor the D11 rule change. It is the first exception to "the audio is not changed" in this section.

**Redoing a scene's narration (JOS-282).** Once the final video exists, the user can ask the voice provider to read one scene again, or a run of consecutive scenes. The user sees the text and its estimated cost before anything is sent, and at most 2,500 characters are read in one take. The provider reads only that text, with up to 1,000 characters of the script on each side as context. The new reading is fitted into the scenes' narration intervals: first by the pause after each scene, then by a speed change of at most 5%. It is spliced into a copy of the current narration, and its volume is matched to the narration around it. Nothing changes until the user listens to a preview (from 3 s before to 3 s after the section) and keeps it. Keeping it makes the spliced copy the session's narration, resets the pause edits of those scenes, and rebuilds the final video as a new version. Discarding it changes nothing. The stored `voice-over.mp3` and its timestamps are never modified, and each take is billed and reported as a voice-over attempt. It is the second exception to "the audio is not changed" in this section.

The final video can be generated only when every scene is `chunk-complete`. A session with a failed or pending scene cannot reach `final-video`.

**Final MP4 output.** The audio track is the voice-over only; each clip's own sound is removed. Resolution and frame rate are configured: 1280×720 or 1920×1080 (shipped default 1920×1080 at 30 fps), with H.264 video. Clips of any other size are scaled to it. The audio is the voice-over's MP3 stream copied into the MP4 without re-encoding; only a rebuild with an adjusted pause re-encodes it (to AAC).

**Subtitles (JOS-237, product owner decision 2026-10-28).** The final video shows the script as subtitles burned into the image, in every scene and in every assembly (the first one, a retry and a rebuild). The text is the script's, one line at a time and at most 32 characters per line: a line does not split words or cross the end of a sentence, and it prefers to break after a comma, a semicolon or a colon. Each line appears when its first word is spoken and is gone before the next one appears. The word being narrated is highlighted in `#FFCDD0` and returns to white when the narration moves on to the next one; the rest of the text is white with a dark outline (Montserrat Bold, 48 px in the 1920×1080 frame, bottom centre, the same in every language). The timings come from the narration's timestamps (§11.1) and shift with the narration when the user adjusts a pause. They need no provider call and cost nothing. Subtitles cannot be turned off, and no separate subtitle file is delivered. If they cannot be built (the timestamps cannot be read or do not match the script) or drawn (the assembly tool does not support subtitles or the font is missing), the assembly fails as not retryable and the cause says so; a video without them is never delivered. An earlier final video does not change until the user rebuilds it.

If the assembly fails, the audio and the successful scenes are kept. The retry applies to the assembly, without generating the completed components again.

## 8. States and progress

The states of the session and of each chunk are managed separately. The name `complete` is not used as a final state.

### 8.1 Session states

| State | Meaning |
|---|---|
| `submitted` | The session and the script are registered. |
| `voice-over-generating` | The complete narration is being generated. |
| `voice-over-complete` | The complete MP3 is available. |
| `chunk-decomposing` | The timestamps are being obtained and the chunks and their instructions prepared. |
| `chunks-processing` | The images and the clips are being generated. |
| `final-video-generating` | The final MP4 is being synchronized and assembled. |
| `final-video` | The final MP4 is finished and available to download. |
| `failed` | A required phase exhausted its retries or could not be completed; the one that failed is shown. |

**State rules:**
- While any scene is still generating, the session stays `chunks-processing` even if another scene is `failed`. It becomes `failed` only when no scene is still generating and at least one scene is `failed`, and it shows which scenes failed.
- A manual retry on a `failed` session returns it to the in-progress state of the retried phase: scene → `chunks-processing`, voice → `voice-over-generating`, decomposition → `chunk-decomposing`, assembly → `final-video-generating`. The earlier failure stays visible in diagnostics.
- A pause is a separate "paused" marker on top of the current session state, not a state of its own. Continuing removes the marker and leaves the state unchanged.

### 8.2 Chunk states

| State | Meaning |
|---|---|
| `submitted` | The chunk is registered and waiting for its image to be generated. |
| `image-generating` | The image is being generated. |
| `image-complete` | The image is available; the clip has not been generated yet. |
| `video-generating` | The clip is being generated. |
| `chunk-complete` | The image and the clip are available. This is the scene's final state. |
| `failed` | Image or video generation failed and the automatic retries were exhausted. |

A failure keeps the identification of the affected stage. A retry returns to that stage, not to the start of the project.

### 8.3 Visible information

The interface has one section or tab per phase and shows the state of the scenes, the available results, the errors and the actions that apply. Progress is updated during processing. An open session page shows each state change, result, and error as soon as it happens, without reloading.

A pause is shown as an additional control condition, keeping the phase and the progress reached. It is neither a success nor a failure.

## 9. Pause and continuation

The user can prevent a phase from being launched before it has started. A request already sent to a provider continues until it finishes or fails and cannot be paused or cancelled in the MVP.

The results of requests already sent are kept even while a pause is in place. A phase stopped before its launch stays pending until the user explicitly says they want to continue.

The interface must distinguish between a generation that is still running and a phase that is waiting for the user to continue. A pause does not revert results or remove work done.

A pause applies to the whole session: every not-yet-launched generation, phase, and retry (automatic or manual) is held until the User explicitly continues, so a pause means no new provider calls. Requests already sent finish. There is no per-scene pause.

## 10. Failures, retries and corrections

### 10.1 Automatic retries

After a transient failure, the system allows up to **three automatic retries in addition to the initial attempt** of the affected stage. It does not retry automatically without end.

A failure the provider reports as not retryable (for example, a content-filter rejection) skips automatic retries and goes directly to `failed` with its cause shown. A disallowed script never reaches the pipeline: it is refused at submission (§4.1, JOS-187). Corrected `IMAGE`/`VIDEO` instructions (§10.3) are not moderated.

Each stage has a configured maximum of simultaneous provider requests, shared across all sessions. Requests beyond it wait their turn and are sent first come, first served, regardless of session. Waiting counts neither as a failed attempt nor as execution time.

When the limit is exhausted, the stage is `failed`. The interface shows an understandable error and the manual retry option when it applies. The policy must prevent internal recovery mechanisms from multiplying the functional limit by accident. A clip request that passes its phase limit while the provider still reports it as running is therefore neither failed nor resent: the same provider task keeps being followed, and a result that arrives late is accepted, so one scene costs one provider task. The wait ends at the clip wait ceiling (§11.3), counted from the moment the task was sent and across restarts; the scene then fails as not retryable, with a cause saying the provider task may still be running, and the User can retry it by hand, which sends a new task. A task the provider reports as failed, or no longer holds, follows the automatic retry rule above (JOS-204).

Waiting before a stage starts must not be confused with execution time, nor cause a premature failure of scenes that start later. Per-phase maximum times are configured (§11).

**Image requests (JOS-239).** The provider keeps working on, and bills, a request the application stops waiting for, so an image request is never abandoned and resent while it can still finish. Each image attempt sends one request to the provider's queue and follows that same request until it completes, fails or reaches its ceiling. Time the request spends waiting in the provider's queue is not execution time: the image stage's maximum time counts from the moment the provider starts the request, and the wait in the queue is bounded by a start window set on the request (§11.3). A request still running past the maximum time keeps being followed, and its image is accepted; at twice the maximum time the application cancels it and the scene fails with a cause saying the provider may still finish and bill it, with no further automatic retry in that cycle. A status check that gets no answer is not a failed attempt. An automatic image retry is sent only after the automatic-retry delay (§11.3), and at least as long as the provider's own request for a later retry (HTTP 429, `Retry-After`).

**End-of-session image retry (JOS-239).** When no scene of a session is still waiting or generating an image or a clip, each scene that failed at the image stage for a reason a retry can fix (an exhausted retry cycle, the ceiling above, a request that never started) gets one new retry cycle automatically, as if the User had pressed "Retry scene". This happens at most once per session. A failure a retry cannot fix (for example a rejected reference image or a missing key) and a clip failure are not retried this way. The session is shown as failed, with its failed scenes, only after this retry has run or has nothing to retry; a paused session is retried once it continues.

### 10.2 Manual retries

The user can retry the failed stage, keeping the earlier successful results. Exhausting the automatic retries blocks the affected progress, but does not delete the project or its files.

When a scene ends in `failed`, all other scenes keep generating until they reach `chunk-complete` or fail themselves; only the final video waits. Each manual retry starts a new cycle of up to three automatic retries.

### 10.3 Allowed edits

| Failure | Allowed action |
|---|---|
| Image generation | Retry with the same instruction, or correct only `IMAGE`. |
| Video generation | Retry with the same instruction, or correct only `VIDEO`, keeping the successful image. |
| Voice generation | Retry the failed generation with the same script, without replacing an audio that is already complete. |
| Obtaining the timestamps | Retry on the same audio. If native timestamps were returned but are unusable, automatic and manual retries switch directly to the alignment stage (§11.1); the voice provider is not asked again. |
| Decomposition | Retry dividing the same script, without rewriting it or regenerating the audio. |
| Final assembly | Retry the assembly with the components already generated. |
| A defect the user sees in a generated scene | Rebuild the scene: its image and its clip are generated again, with the same instructions or with corrected `IMAGE` and/or `VIDEO`, with the provider the scene is bound to. It is available in any session with generated scenes, also during processing and after an assembly failure, except while the final video is being assembled. The final video is rebuilt automatically with the new clip and the clips of the other scenes, which are taken as correct. Nothing is overwritten: the earlier files are kept. |

No recovery allows changing `ID`, `PROMPT`, the narrative order, the narration interval, the clip's requested duration, the speed factor or a completed voice-over. Visual corrections are the only exception to the rule that chunks cannot be edited.

## 11. Providers and operation

The operational settings (maximum times, request caps, segmentation lower bound, speed-factor limit, output resolution and frame rate, supported languages) come from local settings files, read and validated once when the application starts. The application ships a default file holding the values recorded in §11.3; an optional file in the user's application-data folder replaces any subset of them. If the settings are missing a value, have a wrongly typed or out-of-range value, contain an unknown key, or are inconsistent, the application does not start and lists every problem. Editing a file while the application runs changes nothing until the next start. Each stage's providers (reasoning, voice, alignment, image, video) are provider profiles managed on `/admin`: a profile is a stage, an adapter type the application ships for it, a display name, the parameters of that adapter type (reasoning model; voice model, voice, output format and speed; alignment endpoint path; image model; video endpoint path and admitted durations) and an API key. An adapter type sends its requests to its own vendor, so a parameter never names a host or a URL. The first profile of each stage is created from the provider section of the settings the first time the application starts; afterwards those sections no longer change a profile. There is one active provider per stage (§11.2). Provider credentials are never read from a settings file.

| Stage | Required capability |
|---|---|
| Reasoning | Divide the script faithfully per §6.1 and generate visual instructions. The capability reference set for the project is equivalent to Sonnet 4.6 or higher. Verified: OpenAI `gpt-6-astra` (§11.3). |
| Voice | Produce the complete narration as MP3 with a preconfigured voice, quality and speed, and return timestamps of the generated audio fine-grained enough to place each fragment of the script. Verified: ElevenLabs, character-level native timestamps (§11.3). |
| Alignment | Derive the timestamps by aligning the generated MP3 against the script when the voice provider's native timestamps are not available or are unusable (§11.1). Verified: ElevenLabs Forced Alignment, same account as Voice (§11.3). |
| Image | Generate images from text in 16:9 with a minimum resolution of 1920 × 1080. Verified: Fal.ai `fal-ai/flux/dev` (§11.3). |
| Video | Animate a reference image with a requested duration within its capabilities. Its admitted durations and maximum are configured (§11.3: shipped default 5-15 seconds). Verified: RunningHub, MiniMax-H3 "Hailuo-03" (§11.3). |

### 11.1 Timestamps and fallback mechanism

Timestamps are a required capability of the voice stage. They are obtained by one of two mechanisms, in this order of preference:

1. **Native timestamps.** The voice provider returns them with the MP3.
2. **Forced alignment.** If the active provider does not return them, the system derives them by aligning the generated MP3 against the known script. Forced alignment is performed by the alignment stage and its own provider; it is also used when native timestamps are returned but unusable.

Forced alignment is the product's declared fallback mechanism and does not replace the preference for native timestamps. Verifying which of the two applies to the configured voice provider is a task prior to implementing the decomposition phase.

Failing to obtain the intervals by either mechanism is a decomposition failure, is shown in `chunk-decomposing` and follows the retry policy of §10.1.

### 11.2 Provider binding and change

The Administrator can change the active provider of any stage (reasoning, voice, alignment, image, video) on `/admin`, among the stage's providers that are usable: valid parameters and an API key that can be found. The choice is stored, overrides the provider the settings named when the profiles were first created, survives a restart and applies without a restart to every stage that is not yet bound to a provider. No operational setting is editable on `/admin`; those still need a file edit and a restart. There is no automatic switching: when a stage's retries are exhausted it stays on its provider.

The Administrator adds, edits and deletes providers on `/admin`. A change to a provider's parameters applies, without a restart, to the next request sent through it, including the retries of stages already bound to it; it never changes what a session has established (requested durations, speed factors, intervals, chunks, completed results). A provider that is the active provider of a stage cannot be deleted. A provider that sessions or scenes are bound to is retired instead of removed: it is no longer offered, and it keeps serving the retries of what is bound to it. The admitted durations used to segment a script and to request a clip are those of the active video provider when they run; a clip whose stored duration the active video provider does not admit fails, before it is bound, with a message that names it, and can be retried after the active provider is changed back. The application asks for a provider's API key by the stage's role and receives the key of the provider the stage is bound to, or of the active provider when it is not yet bound.

Every stage is bound to a provider at its first attempt, once and for good: reasoning, voice and alignment per session; image and video per chunk. The binding is the provider active at that moment. The stage keeps it for its automatic and manual retries, whatever the active provider is later. Changing the active provider never regenerates a completed result. A stage that used native timestamps binds no alignment provider.

A stage tied to a provider that is unavailable keeps retrying that same provider until it recovers, unless the Administrator moves it. `/admin` lists the failed stages that are bound to a provider other than the current active provider of their stage type, with an action to move each one to the current active provider. A move binds that one stage to the provider that is active at that moment and nothing else: it sends no request and does not retry; the next retry, automatic or manual, goes to the new provider, and the attempts recorded before the move keep the provider they ran on. A stage whose failure offers no manual retry is not listed. A move never regenerates a completed result of the session or its scenes, and nothing moves by itself, not even when retries are exhausted. Completed results are never regenerated, except a scene the User rebuilds because of a defect they see (§10.3): that scene is no longer a completed result, and every other result is kept.

The Administrator can test a saved provider's connection on `/admin`. A test sends exactly one request, with no retry, to the host of the provider's vendor, with the provider's stored key and current parameters; it shows one of: connected, key rejected, model or voice not found, vendor unreachable, or an unexpected answer with its HTTP status. Each result says what the check covered: the key and the model (reasoning, image), the key and the voice but not the voice model (voice), or only the key, not the endpoint (alignment, video). A pass proves what it covered and nothing more: it does not prove the balance, the content filters or the endpoint's parameters. Every check shipped today is a free lookup. A check the vendor charges for would be stated on the page before it is sent and refused by the server until the Administrator confirms it. A test shows neither the key nor the vendor's answer and changes nothing: no provider, key, binding, attempt or usage record is written, and the test is not counted in the reports (§11.4). A restricted key (for example one that cannot read voices) can fail the test and still work for generation.

**Configured video connector (JOS-219).** Besides the coded RunningHub provider, a video provider can be a configured connector: the Administrator writes, on `/admin`, the vendor's base URL (`https://` and a host only), the model, the clip resolution, the admitted durations and the vendor's requests as JSON (headers, an optional upload of the scene image, the submit, the poll and an optional connection check), with placeholders the application fills (`{instruction}`, `{duration}`, `{model}`, `{resolution}`, the scene image, the task id and the key). Runway (Wan, Kling) and RunningHub were proven this way; their definitions are in `docs/video-connector-definitions.md`. The key is sent only in the definition's headers and only to the connector's host: changing the host clears the stored key, which must be typed again. "Duplicate" starts a new connector from an existing one, for another model of the same vendor, and can reuse its stored key on the same host without showing it. A connector does not cover vendors that need a signed request, a key in a body or a query, a callback, or more steps than upload, submit and poll; those still need a coded provider. A vendor's refusal is shown by its step and HTTP status (or its own error code), never by its message, because vendors echo parts of the key.

A change to the configured admitted durations, languages, or any other setting, after a restart, does not alter what existing sessions have already established: intervals, chunks, requested durations, speed factors, warnings, the session's language, and completed results stay as they were. A stage that already has a bound provider keeps it for its retries.

### 11.3 Recorded providers and parameter values (JOS-165)

Defined by `define-provider-configuration` (JOS-165) and shipped as the default settings file (`backend/config/settings.default.json`). The values below are those defaults; a per-user override file can replace them (§11). Verified against real calls (never from documentation alone). Evidence and provenance: `docs/adr/0005-provider-selection.md`.

| Stage | Provider | Identifier |
|---|---|---|
| Reasoning | OpenAI | `gpt-6-astra` |
| Voice | ElevenLabs | `eleven_multilingual_v2`, voice "Burt Reynolds™" |
| Alignment | ElevenLabs | Forced Alignment API — same account as Voice |
| Image | Fal.ai | `fal-ai/flux/dev`; with a reference image, `bytedance/seedream/v5/pro/edit` (setting `imageReferenceModel`, §11.5) |
| Video | RunningHub | MiniMax-H3 "Hailuo-03", at 768P; other vendors through a configured connector (§11.2) |

| Parameter | Value | Notes |
|---|---|---|
| Video admitted durations | 5-15 seconds | Both ends measured with real calls |
| Segmentation lower bound (§6.1) | 5 seconds | = video provider's measured minimum |
| Output resolution and frame rate (final MP4, §7.3, D08) | 1920×1080 @ 30fps (1280×720 also allowed), H.264 video, voice-over MP3 audio copied unchanged | The assembly scales every clip to the output size. RunningHub generates at 768P (1344×768@24fps, upscaled for 1080p) rather than 2K, to cut the clip cost (USD 0.077 instead of 0.12 per second: set RunningHub's price per clip second on `/admin`); no video provider may be set above 1080p |
| Supported script languages (§4.1, D09) | English, Spanish | Each verified independently across voice, alignment and reasoning |
| Acceptable speed-factor limit | 2.0 (speed changes from 0.5x to 2.0x) | `define-media-assembly` (JOS-182) recommends 0.5x-2.0x (its ADR, Decision 5); `decide-silence-allocation` (JOS-142) verified D11's adopted rule against that recommendation (max 1.08x observed) |
| Per-phase maximum times | Reasoning 600s, Image 300s, Voice 600s, Alignment 5s, Video 1200s, Assembly provisional, Clip wait ceiling 2400s | Set above the observed slow tail; assembly depends on JOS-182. Measured at the product's real script size (2026-10-13/14): reasoning 208.6 s for 67 fragments, voice 151 s for 10,217 characters, video clips at 2K 394 s for 7 s, 528 s for 12 s, 546 s for 13 s and above 610 s for 14 s (15 s is admitted); provisional until a full-size session (1,500-1,800 words, 30-50 chunks) has been timed; image 300 s: `bytedance/seedream/v5/pro/edit` took 84 to 233 s (127 s on average, 8 scenes) and 125 s in the real-adapter check (JOS-230); **image request ceiling 600 s (JOS-239):** the image limit counts from when the provider starts the request (time in the provider's queue does not count), and a request still running at twice the limit is cancelled and the scene fails with no retry in that cycle; **clip wait ceiling 2400 s (JOS-204):** twice the video limit, counted from the moment the clip task was sent. A clip past its 1200 s limit keeps its one provider task (which the provider keeps running and billing) instead of being resent; at the ceiling the scene fails as not retryable and can be retried by hand. Provisional like the limit: the 14 s clips measured 661-730 s on 2026-10-14, well inside it |
| Image queue start window | 1800 s per request | Sent with each image request: how long it may wait in the provider's queue before the provider starts it; a request that never started is dropped and not billed. Fixed in the application (JOS-239) |
| Automatic-retry delay | Base 2 s, cap 30 s | Exponential: `min(2 s × 2^(attempt−1), 30 s)` between attempts of a cycle; a provider's Retry-After is never undercut. Accepted by the product owner (JOS-203 B5) |
| Maximum simultaneous requests per stage | Reasoning 50, Image 6, Voice 4, Alignment 2, Video 4 (`limit-provider-requests-per-stage`, JOS-167; raised by `probe-provider-request-caps`, JOS-188; image set by `follow-fal-image-queue`, JOS-239) | Image: the fal.ai account allows 20 concurrent requests (dashboard, 2026-10-30), and a run of 49 scenes at a cap of 200 got 29 refusals (HTTP 429), then timeouts, while the provider billed the requests the application had abandoned (about 72% of that run's image spend); 6 is the product owner's safe value, well under 20, which the reference model and the connection test share. Voice: ElevenLabs refuses the 6th simultaneous call (limit 5, measured on the Creator tier), so 4 leaves one slot for another use of the same key. Alignment draws on a separate pool from voice (10 simultaneous calls succeeded) and keeps 2. Video 4: 4 and 6 simultaneous 5 s 2K RunningHub jobs showed no queueing, error or slowdown, so 6 is the highest level tested. One afternoon, on a `SHARED` RunningHub account |

**Not-retryable failure signal**: tested against all four provider-calling stages with disallowed instructional content — **none produced a distinguishable rejection** (`docs/adr/0005-provider-selection.md`, Decision 5). **Resolved at the entry point by JOS-187**: the script is checked by OpenAI's moderation endpoint before a session exists. Moderation model `omni-moderation-2024-09-26`, maximum time 10 seconds (measured 0.12–2.2 s). The downstream stages still have no content signal, and corrected `IMAGE`/`VIDEO` instructions (§10.3) remain unmoderated.

### 11.4 Administrator reports (JOS-175)

The Administrator sees read-only reports on `/admin`, computed from what the application stores on the user's own computer. A report writes nothing, sends nothing off the device, requires the Administrator password, and never shows an API key, a script, a prompt or instruction, narration text, or a provider's own words in a failure message. Aggregate reports take a period (the last 7 days, the last 30 days by default, all time, or a custom range) applied to the instant each attempt was sent; times are shown in the computer's time zone. There is no download.

The reports are:

1. **Provider usage**, per stage (voice, alignment, reasoning, image, video) and provider: attempts, successes, transient and not-retryable failures, timed-out attempts, success rate, median and 95th-percentile request latency, and the billed units of the successful attempts (voice characters, audio seconds for alignment, images, clip seconds, reasoning requests).
2. **Failures and retries**, per stage: failed attempts by outcome, retry budgets exhausted, manual retries, the most frequent failure wordings of the session-level stages, and the scenes that are failed now by stage.
3. **Sessions**: one row per session created in the period (title, created, state, scenes, failed scenes, attempts, time to the voice-over and to the final video) with a drill-down to its scenes (providers, attempts, requested duration, speed factor and warnings).

Two more reports give the **pipeline time** (elapsed time per phase and time-limit hits) and the **provider changes** (when the active provider changed or a failed stage was moved, below), and a sixth gives the **estimated cost** (below).

**Estimated cost (JOS-227).** This report is built from the same attempts as provider usage so that the billed units in both always agree. Per stage and provider it shows the billed units (those of the successful attempts), the failed units (those of the failed attempts, shown and never priced), the provider's price per unit and currency, and the **estimated cost** = billed units times the price per unit. A provider with no price is shown as **unpriced**: it has no amount and adds nothing to any total, and zero is a price, not unpriced. Totals are given per currency and are never added across currencies; a total says it leaves out unpriced providers when the period has one. The price used is the provider's current price (the application keeps no price history), so a price edited later changes the estimate of earlier periods. Every amount is labelled an estimate and shown with its currency. The Sessions report gains the estimated cost of each session, per currency, over all its attempts, with a note when a successful attempt ran on an unpriced provider. The report contains no key, script, prompt, instruction, narration text or failure text. It is an estimate of what the vendors bill for the attempts the application recorded; it is not an invoice, converts no currency, and does not include the Administrator's own taxes or plan discounts.

**Price per unit (JOS-226).** Each provider profile accepts an optional **price per unit** (a number zero or greater) and a **currency** (a three-letter ISO 4217 code), both or neither, entered only on `/admin` (the settings files do not take it). The unit is the stage's billed unit: voice character (voice), audio second (alignment), request (reasoning), image (image), clip second (video). A profile with neither is *unpriced*; a price of zero is a price (a free provider), not unpriced. The price is never sent to the provider and never makes a profile unusable; the estimated cost report is its only reader.

**Provider changes (JOS-229).** The application writes one entry to an append-only log, in the same transaction as the change, whenever the Administrator saves a different active provider for a stage or moves a failed stage to the active provider. An entry holds the instant, the kind, the stage, the session and scene of a move, and the previous and new provider with their display names as the Administrator saw them, so a later rename or deletion does not alter it. Saving the provider that is already active, and any refused request, log nothing. The report lists the entries of the period (the instant the change was made), newest first: when, what (active provider changed or failed stage moved), stage, session title and scene number (blank for an active-provider change), from and to. It shows no other text of the User. Editing a provider's profile, parameters or key is not a provider change.

Until the provider is recorded on each scene attempt, the per-provider figures of the image and video stages attribute an attempt to the provider its scene is bound to now; after a provider move, earlier failed attempts are counted for the provider the scene was moved to. The reports say so.

### 11.5 Visual style setting (`/admin`, JOS-201)

Behind the Administrator password, `/admin` holds one **visual style prompt** (text, 0 to 8,000 characters; empty means no style) and one optional **reference image** (PNG, JPEG or WebP, up to 5 MB).

- Each new session keeps a copy of the prompt as it was when the session was created. The first decomposition, any retry of it and a restart all use that copy, so saving `/admin` never changes a session already in progress.
- The prompt is sent to the reasoning provider as separate creative direction (style, recurring characters, tone) before the fixed rules. If it conflicts with those rules (one image and one video instruction per fragment, no merging or skipping, the required output format), the rules win. Because the image provider receives only each scene's image instruction, every image instruction must repeat the full description of any recurring character.
- The prompt is user text sent to a provider: its content is never logged, only its length.
- Each new session also keeps a copy of the reference image (and its hash) in its project folder. Every image request of that session, including a retry and a request after a restart, carries that copy to the image provider, which then uses the reference-capable model of §11.3; a session without a reference sends a text-to-image request. The `/admin` image changing or being removed never affects a session already created. If the provider rejects the reference (HTTP 400, 413, 415 or 422), that scene fails as not retryable with a reason that names the reference image and no other scene is affected. The video stage already starts from the scene's generated image and gets no reference image.
- Several styles, a style chosen per session and a fixed style prefix on the image request are out of scope.

## 12. Persistence, files and downloads

### 12.1 Project preservation

The system keeps sessions, chunks, states, references to results and errors persistently. Progress must survive restarts and be recoverable in later queries.

After a restart, a request already sent to a provider is resumed: the system waits for its original result if the provider still holds it. If it cannot be recovered, it counts as a failed attempt and follows §10.1.

Receiving more than one success confirmation for the same generation must not duplicate results, start the next stage twice or add a scene to the assembly more than once.

Processing happens only while the application is running; if the computer sleeps or the application is closed, in-progress sessions resume from their saved state the next time it starts.

### 12.2 Files

Local files are organised in folders identified by the video's title and **are never deleted automatically and never expire**. Projects with the same title must stay separate and not overwrite each other's results. Each project folder is named with the video title plus the project's creation date and time to the minute (e.g. `My Trip 2026-09-15 10-42`); if a folder with that name already exists, a counter is appended (e.g. `My Trip 2026-09-15 10-42 (2)`).

The script and the generated texts, the complete MP3, its timestamps, the clips and the final MP4 are kept locally. Every result delivered only as a temporary provider link, images included, is saved into the project folder before the link expires. The store and the project folders live in the user's application-data folder on their computer, never in the installation folder, so updating or reinstalling the application keeps them. They are never deleted or expired automatically; copying them elsewhere (backups) is the user's choice.

Keeping the files does not depend on the session being current. Sessions do not expire in the MVP; they remain consultable, downloadable, and resumable indefinitely.

### 12.3 Access model, downloads and isolation

The MVP is a **single-user application installed on the user's own computer**. It is delivered as an executable that needs no other software installed; it runs the interface and all processing locally and calls the cloud AI providers (§11) over the internet. The application has no accounts. The only credential is one shared Administrator password that unlocks `/admin` and every Administrator endpoint (`/admin/…`); the User's pages and endpoints need no login, whether or not a password is configured.

The user can download successful images and clips one by one while other scenes are still processing or have failed. The final MP4 is available only after the assembly completes. In-app downloads are limited to per-scene images, per-scene clips, and the final MP4; the MP3, timestamps, script, and generated texts are stored locally (§12.2) but cannot be downloaded from the app.

Sessions are consulted by their identifier. The separation of data between sessions is a **functional integrity requirement, not a security control**: it prevents one project from showing or overwriting another's results, and it does not protect against access by third parties.

The application accepts requests only from its own interface on the same computer: it listens on the local loopback address and rejects requests coming from other web pages open in the user's browser. Admitting more than one person, or reaching the application from another computer, is outside the MVP (§2.3).

### 12.4 Telemetry and privacy

1. **Prior consent.** Vid4You sends no data off the user's computer without their permission. On first start a notice is shown with three checkboxes, all unchecked: *error reports*, *provider usage and cost counts* and *anonymous usage counts*. The user saves their choices with **Save**, or closes the notice with **Not now** or Escape; either way an answer is recorded (with "Not now", everything off) and the notice does not come back by itself. The notice includes a link to the privacy policy. The choices can be changed at any time from the **Privacy** button.
2. **What is sent, when enabled.**
   - *Errors:* the error's code, message and stack trace, with file paths and the user name removed.
   - *Providers and costs:* how many calls were made per stage and provider, their outcome (success, transient, no answer from the provider, not retryable), how long they took and the billed units (images, clip seconds, voice characters). From these counts, the developer receives a critical email alert when a provider stops answering (3 or more unanswered calls for one provider and stage within 5 minutes).
   - *Usage:* how many times the application is opened, how many sessions are started and how many final videos are generated.
   - In every case: version, channel (UAT/PROD), operating system, architecture and a random identifier of the installation.
3. **What is never sent.** Title, script, narration, prompts, images, clips, file names or paths, the user name, provider keys or any personal data.
4. **Local log.** Regardless of consent, the application keeps a rotating local log (10 MB × 5 files) in the user's data folder; it never leaves the computer.
5. **New version notice.** In UAT and PROD, at start-up, the application checks the latest version published on GitHub once and, if there is one different from the installed version, shows a notice with a link to the release. It downloads and installs nothing. It does not depend on telemetry consent.
6. **Published privacy policy.** The repository includes `PRIVACY.md`, linked from the notice, with the above and the retention period: data is kept for as long as the free tier of the observability service allows.
7. **Destination.** The data goes through a dedicated relay (`otel.vid4you.download`) that drops any attribute that is not allowed before forwarding it to the observability service.

## 13. MVP acceptance criteria

| ID | Verifiable result |
|---|---|
| AC01 | A valid title, a valid script, and a language selected from the supported list start a session without tags or chunk delimiters. |
| AC02 | A single MP3 is produced per script; the script cannot be changed once the project starts, and the voice cannot be regenerated after success. |
| AC03 | The narrated fragments rebuild the complete script in order, with no omissions, duplications or rewriting. |
| AC04 | The chunks have consecutive, unchanging identifiers and their four content fields complete. |
| AC05 | No video is requested while its chunk's image is not available. |
| AC06 | Each video request uses the admitted duration requiring the smallest speed change to match the narrated interval, and never exceeds the provider's maximum. |
| AC07 | A phase paused before its launch does not start until continued; a request already sent is not interrupted. |
| AC08 | After three automatic retries are exhausted, the failure is reported and no indefinite automatic cycle continues; a not-retryable failure is reported without automatic retries. |
| AC09 | A visual failure allows correcting only its stage's prompt and keeps the narrative content. |
| AC10 | A failed scene prevents generating the final video; its successful results and those of other scenes stay available. |
| AC11 | The assembly follows the numeric order, even when the scenes finished in another order. |
| AC12 | `final-video` is reached only with every scene complete and a narrated, synchronized, downloadable 16:9 MP4. The scene change happens exactly when the next scene's narration starts, per the D11 rule (§7.3). |
| AC13 | An assembly failure can be retried without regenerating the voice, images or successful clips. |
| AC14 | A restart does not lose progress; repeated confirmations do not duplicate scenes or launches. |
| AC15 | Local files are not deleted automatically, and two projects with the same title do not overwrite each other's results. |
| AC16 | The MVP allows pauses and partial downloads without requiring an administration interface or reports. |
| AC17 | The cuts between chunks fall on sentence boundaries, except for the long-sentence exception of §6.1. |
| AC18 | No chunk exceeds the video provider's maximum or falls below the configured lower bound, except for a whole script shorter than the lower bound and a sentence that cannot be split (§6.1.1). |
| AC19 | The chunks' intervals are contiguous, do not overlap and cover the voice-over from second 0 to its total duration, with each silence assigned to the previous scene (D11, §7.3). |
| AC20 | The system obtains the intervals from native timestamps or, when they are missing, by forced alignment; failing to obtain them is reported as a decomposition failure, not a voice failure. |
| AC21 | The interface shows, by phase and by scene, the current state, the available results, the errors and the actions that apply, and reflects progress during processing. |
| AC22 | A session consulted by its identifier shows only its own chunks, files and results. |
| AC23 | Each scene records the requested duration and the applied speed factor, and shows them in its scene details. |
| AC24 | The User can rebuild a generated scene, optionally editing its `IMAGE` and `VIDEO`; only that scene's image and clip are generated again, with its bound providers, nothing already produced is overwritten, and the final video is rebuilt automatically from the updated scene. |
| AC25 | The final video shows the script as one-line subtitles of at most 32 characters, with the word being narrated highlighted, in every assembly; the subtitles follow the User's pause edits; and an assembly fails, rather than deliver a video without them, when they cannot be built or drawn. |

AC12 and AC19 reflect the rule adopted in D11 (silences assigned to the previous scene).

## 14. Product decisions

| ID | Decision required | State | Resolution adopted |
|---|---|---|---|
| D01 | Scope of the pause and handling of pending retries. | **Closed** | Pause applies to the whole session; requests already sent finish; new phases and automatic and manual retries are held until continue (§9). |
| D02 | Discrete durations, scenes that exceed the maximum, and quality of the visual fit. | **Closed** | Segmentation rule of §6.1 with an upper and a lower bound, and selection of the closest admitted duration in §7.2. The speed factor is not an independent parameter. |
| D03 | Recovery of stages bound to an unavailable provider. | **Closed** | The stage keeps retrying the same provider until it recovers; the Administrator can move a failed stage to the current active provider on `/admin`. Nothing moves automatically (§11.2). |
| D04 | Effect of session expiry after two days. | **Closed** | No session expiry in the MVP (§12.2). |
| D05 | Dependence on the provider's temporary links. | **Closed** | Every temporary-link result, images included, is saved locally before its link expires (§12.2). |
| D06 | Continuation of other scenes after a failure, and retries after a manual action. | **Closed** | Other scenes keep generating; each manual retry starts a new cycle of up to three automatic retries (§10.2). |
| D07 | Authorization and access to sessions. | **Closed** | Single-user application installed on the user's computer; no accounts or authorization; only the application's own local interface can use it. The separation between sessions is functional integrity, not security (§12.3). |
| D08 | Output parameters of the final MP4. | **Closed** | Voice-over-only audio (clip sound removed); configured resolution and frame rate, 1280×720 or 1920×1080 only (shipped 1920×1080 at 30 fps); H.264 video; audio is the voice-over MP3 copied unchanged, AAC only after a pause adjustment (§7.3). |
| D09 | Supported languages. | **Closed** | Hardcoded list of supported languages; the User selects the script language from that list when starting a project, and no provider is called before that (§4.1). |
| D10 | Exact moment the script is locked during voice generation. | **Closed** | The script is locked when the User starts the project (§4.2). |
| D11 | Assigning the narration's silences to a scene. | **Closed (JOS-142, 2026-09-29)** | The previous scene absorbs the silence that follows it (compared against splitting the silence between neighbouring scenes, the interim rule of JOS-140, which was discarded). Threshold: up to 2 s acceptable, 3 s starts to feel slow; no real script exceeds 1.26 s. Verified per §14.1. |

### 14.1 Silence allocation POC (D11) — Closed

The POC (`decide-silence-allocation`, JOS-142, 2026-09-29) compared the two candidate rules and produced a closed decision:

- Compared on four real scripts (English and Spanish) with native and forced-alignment timestamps: neither rule is ruled out by the bounds of §6.1 or by the speed factor (maximum observed 1.08x, well below the recommendation of `define-media-assembly`, JOS-182: 0.5x-2.0x).
- Audiovisual comparison: the same real script, assembled once with each rule and with a sweep of growing silences (1, 1.5, 2, 3 and 4 s), shown to the product owner.
- Verdict (product owner, 2026-09-29): rule A (the previous scene absorbs the silence) reads better at natural pauses; a clip holds up to 2 s of silence acceptably, and 3 s starts to feel slow.
- The longest real silence measured (1.26 s) is below the threshold, so no third rule is defined.
- Adopted rule, threshold, and §7.3, AC12 and AC19: done. Evidence: `docs/adr/0006-silence-allocation.md`.

**Derived idea, outside the scope of this decision**: a manual control for the user to adjust a scene that feels slow, built as the manual pause adjustment (JOS-190, §7.3).

## 15. Non-blocking open gaps

Recorded for prioritisation. They do not prevent defining the MVP or refining it.

| # | Gap | Affected section |
|---|---|---|
| 1 | The allowed transitions between states are not declared, in particular leaving `failed` after a manual retry. **Closed** (§8.1 state rules). | §8, §10.2 |
| 2 | Transient and permanent failures are not distinguished. A rejection by the provider's content filter would use up the retry budget with no chance of success. **Closed** (not-retryable failures skip automatic retries, §10.1). | §10.1 |
| 3 | The pause is not represented in the data model or the state machines. Depends on D01. **Closed** (pause marker, §8.1). | §3, §8 |
| 4 | The manual provider reassignment foreseen in D03 has no defined channel, since there is no administration interface. **Closed** (the Administrator moves a failed stage on `/admin`, §11.2). | §2.3, §11.2 |
| 5 | There is no scale limit per session: no word bound, no chunk count bound, no generation budget. **Closed** (no limits in the MVP, §4.1). | §4.1, §10.1 |
| 6 | Concurrency between sessions and the active provider's rate limits are not handled. **Closed** (request limit per stage, first come first served, §10.1). | §11 |
| 7 | The mechanism that updates progress in the interface is not defined. **Closed** (live updates without reloading, §8.3). | §8.3 |
| 8 | The rule that tells apart folders with the same title is not defined. **Closed** (title + creation date/time + counter, §12.2). | §12.2, AC15 |
| 9 | There is no content policy for scripts sent to third-party providers. **Closed** (providers' own content filters only, §4.1). | §4.1, §11 |
| 10 | No non-functional requirements, business goal or success metrics are defined for the MVP. **Closed (product owner, 2026-11-11)**: the functional requirements (§13) are met and were verified with the last generated video; no additional non-functional requirements or success metrics are defined for the MVP. | Whole document |
