## ADDED Requirements

### Requirement: The User can get a quote for redoing the narration of consecutive scenes

The system SHALL answer `GET /sessions/{sessionId}/narration-takes/quote?firstSceneId=…&lastSceneId=…` for a session that has a voice-over, stored narration timestamps and registered scenes. The quote SHALL contain:
- the text that would be read again: the script's characters from the first character of the first scene's narration to the last character of the last scene's narration, exactly as stored;
- its number of characters;
- the estimated cost: the characters times the price per unit of the voice provider bound to the session, in that provider's currency, or none when that provider has no price;
- the indexes of the selected scenes whose pause edits would be reset.

The selection SHALL be the first scene, the last scene, and every scene between them in index order. A quote SHALL send nothing to any provider and change nothing.

The system SHALL refuse, changing nothing:
- with 404 `unknown-scene` for an unknown session or scene, or a scene of another session;
- with 422 `invalid-range` when the last scene comes before the first;
- with 422 `too-long` when the text has more than 2,500 characters, stating the limit;
- with 409 `narration-not-located` when the session has no voice-over, no stored timestamps, or a selected scene whose narration cannot be located in the timestamps (no `PROMPT`, or characters that do not match the script).

#### Scenario: A quote for two scenes
- **GIVEN** a session whose voice provider is priced at 0.0001 USD per character
- **AND** scenes 1 and 2 narrate 283 characters
- **WHEN** the User asks for a quote from scene 1 to scene 2
- **THEN** the answer is 200 with that text, 283 characters and an estimated cost of 0.0283 USD
- **AND** no provider is called

#### Scenario: An unpriced voice provider
- **WHEN** the session's voice provider has no price per unit
- **THEN** the quote has no estimated cost, and the page says the price is not set

#### Scenario: Scenes in the wrong order
- **WHEN** the User asks for a quote from scene 5 to scene 3
- **THEN** the answer is 422 `invalid-range`

#### Scenario: Too much text
- **WHEN** the selected scenes narrate 2,600 characters
- **THEN** the answer is 422 `too-long` and states the 2,500-character limit

#### Scenario: A pause edit on a selected scene
- **GIVEN** scene 2's pause was edited
- **WHEN** the User asks for a quote from scene 1 to scene 2
- **THEN** the quote lists scene 2 as a scene whose pause edit would be reset

### Requirement: A confirmed take sends the selected text once to the session's voice provider

The system SHALL accept `POST /sessions/{sessionId}/narration-takes` with `firstSceneId` and `lastSceneId`, applying the same checks and refusals as the quote. It SHALL also refuse with 409:
- `take-in-progress` while another take of the session is being generated or is waiting for review;
- `assembly-in-progress` while an assembly attempt of the session is in flight or a final-video rebuild is requested.

An accepted take SHALL be recorded before its request is sent. The answer SHALL be 202 with the take's id. The take SHALL then be sent as exactly one request to the voice provider bound to the session, and it SHALL hold one of that provider's concurrency slots while it is sent. The request SHALL carry:
- the quoted text, unaltered;
- the session's language;
- the voice, model, output format and speed of the bound provider's profile, read when the request is sent;
- up to 1,000 characters of the script before the text as the preceding context, and up to 1,000 characters after it as the following context.

The take SHALL NOT be retried automatically. It SHALL have the voice stage's maximum execution time; a take with no answer by then SHALL fail, and an answer that arrives later SHALL be discarded. A take request SHALL NOT change the voice-over record, the stored MP3, the stored timestamps or any scene.

#### Scenario: The User confirms a quoted take
- **WHEN** the User creates a take from scene 1 to scene 2
- **THEN** the answer is 202, the take is recorded as generating, and one request with the quoted text and its surrounding context is sent to the session's voice provider

#### Scenario: A second take while one is waiting for review
- **GIVEN** a take of the session is waiting for review
- **WHEN** the User creates another take
- **THEN** the answer is 409 `take-in-progress` and nothing is sent

#### Scenario: During assembly
- **WHEN** the User creates a take while the session's final video is being assembled
- **THEN** the answer is 409 `assembly-in-progress`

#### Scenario: Two quick clicks
- **WHEN** two take requests for the same session arrive back to back
- **THEN** exactly one is accepted and the other answers 409 `take-in-progress`

#### Scenario: The provider changed since the voice-over
- **GIVEN** the active voice provider changed after the session's voice-over was made
- **WHEN** the User creates a take
- **THEN** the request goes to the provider bound to the session, with its current profile parameters

### Requirement: The take is fitted into the selected scenes' intervals without changing the narration's length

The system SHALL split a returned take at its own scene boundaries, using the take's character timestamps. It SHALL place each selected scene's part into that scene's stored narration interval:
- the scene's first spoken character SHALL start at the interval's start;
- the pause after the scene's speech SHALL be lengthened or shortened at its middle, as pause edits are;
- the pause SHALL stay between 0.2 s and the larger of 3.0 s and the scene's pause before the take;
- when the pause alone cannot absorb the difference, the scene's speech SHALL be sped up or slowed down by at most 5%, and by the least amount that fits; otherwise its speed SHALL be unchanged.

Every cut SHALL be made in silence, 50 ms before a speech onset or after a speech end. The take's side of each join SHALL get a 10 ms fade; the base narration is never faded. The resulting narration SHALL have exactly as many samples as the narration the take was built on. Outside the replaced section, it SHALL be sample-for-sample identical to that narration. No stored interval, requested duration or speed factor SHALL change.

When a scene's part cannot fit within these limits, the take SHALL fail. Its cause SHALL name the scene and say whether its new reading is too long or too short, and by how many seconds at its normal speed.

#### Scenario: A take that fits with its pauses alone
- **GIVEN** scene 2's interval is 13.54 s and its new reading has 11.74 s of speech
- **WHEN** the take is fitted
- **THEN** scene 2's speech keeps its speed, starts at the interval's start and is followed by a 1.80 s pause
- **AND** the new narration has as many samples as the one before, and is identical before the section and after it

#### Scenario: A slightly long reading
- **GIVEN** a scene whose interval is 6.00 s and whose new reading has 5.95 s of speech
- **WHEN** the take is fitted
- **THEN** the speech is sped up by the least amount that leaves a 0.2 s pause, under 5%

#### Scenario: A reading far too long
- **GIVEN** a scene whose interval is 6.00 s and whose new reading has 6.80 s of speech
- **WHEN** the take is fitted
- **THEN** the take fails with a cause saying that the scene's new reading is too long by 1.0 s at its normal speed, and nothing about the session changes

#### Scenario: A reading far too short
- **GIVEN** a scene whose pause before the take was 0.9 s, whose interval is 13.5 s, and whose new reading has 8.0 s of speech
- **WHEN** the take is fitted
- **THEN** the take fails with a cause saying that the scene's new reading is too short, because even 5% slower it would leave a pause of more than 3.0 s

### Requirement: The take is matched to the volume of the speech around it

The system SHALL apply one gain to the take, so that the RMS level of its speech equals the RMS level of the speech it replaces. The gain SHALL be limited to ±6 dB, and the take's peaks SHALL NOT clip.

#### Scenario: A quieter take
- **GIVEN** a take whose speech is 1.8 dB quieter than the speech it replaces
- **WHEN** it is fitted
- **THEN** a 1.8 dB gain is applied to it

### Requirement: The new narration has timestamps that match the script

The system SHALL store, with each fitted take, the character timestamps of the whole resulting narration:
- the base narration's characters before and after the section, unchanged;
- the take's characters inside it, moved by the same placement, speed change and pause changes as its audio.

These timestamps SHALL pass the same usability check as the stored narration timestamps, with the same character matching. A take whose provider returns no character timestamps, or whose timestamps do not reproduce the quoted text, SHALL fail as not usable.

#### Scenario: Subtitles after a kept take
- **WHEN** a final video is built after a take of scenes 1 and 2 was kept
- **THEN** the subtitle times of scenes 1 and 2 follow the take's timestamps, and every other subtitle time is unchanged

#### Scenario: A provider without timestamps
- **WHEN** the take's provider returns audio without character timestamps
- **THEN** the take fails with a cause saying that the provider gives no timestamps, which a redo needs

### Requirement: The User can review a take before keeping it

A fitted take SHALL wait for review. The system SHALL serve a preview of it at `GET /sessions/{sessionId}/narration-takes/{takeId}/preview`:
- the preview is the resulting narration from 3 s before the section to 3 s after it, cut at the narration's ends;
- it is AAC audio in an MP4 container;
- it is served inline, scoped to its session, and answers single byte-range requests like a scene clip.

`POST …/narration-takes/{takeId}/keep` SHALL keep a take that is waiting for review. `POST …/narration-takes/{takeId}/discard` SHALL discard a take that is waiting for review or has failed. Both SHALL answer 404 `unknown-take` for an unknown take or a take of another session, and 409 `take-not-open` for a take that is already kept or discarded. Keep SHALL also answer 409 `take-not-ready` for a take that is generating or failed. A discarded take SHALL change nothing else.

#### Scenario: Listening before keeping
- **GIVEN** a take of scenes 1 and 2 waiting for review
- **WHEN** the User plays its preview in Safari
- **THEN** the audio plays from 3 s before scene 1 to 3 s after scene 2 ends

#### Scenario: Discarding a take
- **WHEN** the User discards a take that is waiting for review
- **THEN** the take is discarded, and the narration, the pause edits and the final video are unchanged

#### Scenario: Keeping twice
- **WHEN** a kept take is kept again
- **THEN** the answer is 409 `take-not-open`

### Requirement: Keeping a take makes it the current narration and rebuilds the final video

A kept take SHALL become the session's current narration. The session's narration version SHALL be 1 for the original voice-over, and one more for each kept take. Each take SHALL be built on the narration that was current when it was requested. Keeping SHALL be refused with 409 `assembly-in-progress` while an assembly attempt is in flight or a final-video rebuild is requested.

In one atomic step, keeping SHALL:
- mark the take kept;
- remove the pause edits of the take's scenes;
- when the session has a final video, mark it as older than the current narration.

After that step, the final video SHALL be rebuilt automatically, as after a scene rebuild:
- the rebuild starts only when every scene is `chunk-complete`;
- it writes a new version with the current narration and the remaining pause edits;
- the previous version stays current until the new one succeeds;
- a failed rebuild keeps "Rebuild final video" offered.

A session without a final video SHALL use the current narration in its first assembly.

#### Scenario: Keeping a take after the final video
- **GIVEN** a session in `final-video` with version 1
- **WHEN** the User keeps a take of scenes 1 and 2
- **THEN** the narration version is 2, and a rebuild starts without any action by the User
- **AND** on success `final-video-2.mp4` is current, and its audio and subtitles are the new narration

#### Scenario: Keeping while a scene is being rebuilt
- **GIVEN** scene 7 is being rebuilt
- **WHEN** the User keeps a take of scenes 1 and 2
- **THEN** the take is kept, and the final video is rebuilt once scene 7 completes, with both changes

#### Scenario: Pause edits on the redone scenes
- **GIVEN** scene 2 and scene 9 have pause edits
- **WHEN** the User keeps a take of scenes 1 and 2
- **THEN** scene 2's edit is removed, and scene 9's edit is kept and applied in the rebuild

#### Scenario: A second take on top of a kept one
- **GIVEN** a kept take of scenes 1 and 2 (narration version 2)
- **WHEN** the User keeps a take of scene 2
- **THEN** it was built on version 2, and the narration version is 3

### Requirement: Nothing is overwritten, and the session shows what was redone

Each take SHALL write its own files: the provider's audio, the provider's timestamps, the resulting narration, its timestamps and its preview. Their names SHALL carry the take's number, and no file SHALL be replaced. The voice-over record, the stored MP3, the stored narration timestamps, kept and discarded take records, and the files of every take SHALL stay unchanged. A take record SHALL NOT be deleted, and SHALL NOT change after it is kept or discarded.

The session read SHALL carry:
- the narration version;
- for each scene, whether a kept take covers it;
- the latest take while it is generating, waiting for review, or failed and not yet discarded, with its scene range, its state, its preview address when it is waiting for review, and its failure cause when it failed;
- for each scene, whether its narration can be redone.

The read and the logs SHALL NOT carry the script's text, except the quote.

#### Scenario: The session read after a kept take
- **WHEN** the session is read after a take of scenes 1 and 2 was kept
- **THEN** it shows narration version 2, and scenes 1 and 2 as redone

#### Scenario: The original files stay
- **WHEN** a take is kept
- **THEN** `voice-over.mp3` and `narration-timestamps.json` are unchanged, and the take's files are new files

### Requirement: A failed or interrupted take changes nothing

When the provider fails, times out, returns unusable audio or timestamps, or the take cannot be fitted, the take SHALL be recorded as failed with a cause the User can read. The cause SHALL NOT contain credentials. The narration, the pause edits and the final video SHALL stay as they were. The User SHALL be able to start a new take. A missing credential SHALL fail the take without calling the provider. A take still generating when the app starts SHALL be recorded as failed, saying that the app restarted before the new reading arrived, and SHALL NOT be sent again.

#### Scenario: The provider is unavailable
- **WHEN** the voice provider answers a take with a transient error
- **THEN** the take is failed with the provider's reason, nothing is retried, and the User can create a new take

#### Scenario: A restart while generating
- **GIVEN** a take is generating
- **WHEN** the app restarts
- **THEN** the take is failed with the restart cause, and no request is sent for it again

### Requirement: The page offers Redo narration and the take review

The expanded details of a scene whose narration can be redone SHALL show a "Redo narration" action while no take is generating or waiting for review and the session is not assembling. The action SHALL open an inline form:
- it chooses the last scene, from this scene to a later scene;
- for the current choice, it shows the text to be read again, its characters, its estimated cost (or that the price is not set), and the scenes whose pause edits will be reset;
- it states that the voice provider reads the text again and is billed, that the User can listen before keeping it, and that the final video is then rebuilt.

Confirming SHALL create the take.

A session-level panel SHALL show the latest open take:
- while generating, which scenes are being read again;
- while waiting for review, an audio player for its preview with "Keep new narration" and "Discard";
- when failed, its cause and "Dismiss".

A scene covered by a kept take SHALL show "Narration redone" on its card. Refusals SHALL be shown as sentences, not codes. Every control SHALL work with the keyboard and name its scenes.

#### Scenario: Redo from the page
- **GIVEN** scene 1 of a session with a final video
- **WHEN** the User opens Redo narration on scene 1, chooses scene 2 as the last scene, and confirms
- **THEN** the take is created, and the panel says that scenes 1 to 2 are being read again

#### Scenario: Review from the page
- **WHEN** the take is waiting for review
- **THEN** the panel shows its preview player with Keep new narration and Discard
- **AND** after Keep, the panel disappears, scenes 1 and 2 show "Narration redone", and the final video rebuild is shown as running

#### Scenario: No action while a take is open
- **GIVEN** a take is waiting for review
- **THEN** no scene offers Redo narration
