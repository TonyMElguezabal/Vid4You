## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/polish-scene-and-admin-ui` from `UAT`, in the worktree `.worktrees/polish-ui`. `UAT` holds `listen-to-voice-over`, `rebuild-scene-clip-only` and `final-video-build-progress`, which all change `SceneRow.tsx`. Once they are merged into `main`, rebase onto `origin/main`.
- [x] 0.2 Record the archive order: `watch-scene-clips` and `listen-to-voice-over` are archived before this change, because its deltas modify their requirements (`scene-detail-view`, `voice-over-playback`).

## 1. Player: tests first

- [x] 1.1 Rewrite the player tests in `scene-clip-player.test.tsx` and `voice-over-player.test.tsx` so they fail today. They cover:
  - one Play/Pause button, named `Play …` while not playing and `Pause …` while playing;
  - no Stop at the start;
  - Stop shown while playing, and while paused or ended away from the start;
  - Stop pauses, calls `load()`, rewinds, hides itself and puts focus on the toggle;
  - the error sentence, with Play still offered;
  - a new `src` remounts the player not playing and with no Stop;
  - starting one player pauses another (clip and voice-over).

## 2. Player: implementation

- [x] 2.1 Change `MediaPlayer` to the toggle and the conditional Stop, with `title` tooltips and icon-only buttons (design Decisions 1 and 2).
- [x] 2.2 Add `.icon-button` and `.transport` to `app.css`: over the clip on the scene card, and a light pill for the voice-over. The pill becomes opaque under reduced transparency (design Decision 3). Remove the `.media-controls` rules.

## 3. Scene list and card: tests first

- [ ] 3.1 Write failing tests in `components.test.tsx`. They cover:
  - opening scene 5 closes scene 2;
  - Hide details closes it and opens none;
  - a live update leaves the open scene open;
  - the opened card's `scrollIntoView` is called with `block: "nearest"`;
  - the toggle keeps its names, `View scene N details` and `Hide scene N details`, with the visible text "Details" and "Hide details".
- [ ] 3.2 Write failing tests for the opened card. They cover:
  - with a clip: one video with the image as its poster, and no separate image;
  - with only an image: the image and no video;
  - the duration shown as `15 s` and the speed factor as `×1.16`;
  - the field labels "Prompt", "Image", "Video";
  - Retry, Rebuild scene and Redo narration inside one action bar, and the Rebuild form's Clip only choice still there.

## 4. Scene list and card: implementation

- [ ] 4.1 Move `expanded` into `SceneList` as `openSceneId`. `SceneRow` takes `expanded` and `onToggleExpanded`, and scrolls into view on opening (design Decisions 4 and 5).
- [ ] 4.2 Make the details toggle `quiet` with the short visible text "Details" / "Hide details". Leave the status line as it is (design Decision 6).
- [ ] 4.3 In the opened card:
  - render `clipPlayer ?? image`;
  - put the duration and speed in `.summary-tiles`, moved to the shared part of `app.css`;
  - use normal-case labels;
  - group the diagnostics under "Providers";
  - add the `.action-bar` holding the actions and their forms (design Decisions 7 to 9).
- [ ] 4.4 Fix the pause field width, put the "s" suffix inside the field, and make Reset quiet (design Decision 10).

## 5. Controls: buttons and dropdowns

- [ ] 5.1 Add `.quiet` to `app.css`, replace `button.toggle`, and use quiet for Details, Reset, Cancel and downloads (design Decision 11). The downloads show "Image" and "Video" and keep the names `Download scene N image` and `Download scene N video`.
- [ ] 5.2 Add `--color-select-arrow` for both themes to `tokens.css`, and the drawn arrow to the `select` rule (design Decision 12). Check the start page's language select and the admin selects at 375 and 1280 px.

## 6. Administrator page: tests first, then implementation

- [ ] 6.1 Write failing tests. They cover:
  - in `provider-profiles-section.test.tsx`, a button showing "Edit" named `Edit {label}`, "Add" named `Add {stage} provider`, and the charged-test notice with "Send charged test" and "Cancel";
  - in `failed-stages-section.test.tsx`, rows with no list bullets, and a button showing "Move" that keeps its full name;
  - in `active-providers-section.test.tsx`, the source shown as text, not a badge.
- [ ] 6.2 Replace `className="field"` with `admin-section` and a `section-head` in `VisualStyleSection`, `ActiveProvidersSection`, `ProviderProfilesSection`, `FailedStagesSection` and `ReportsSection`. Add the active-provider grid. Rename `.provider-list`/`.provider-row` to `.row-list`/`.row`, and use them for failed stages. Add the short visible labels with `aria-label`, the callouts, and remove the `{" "}` spacers (design Decision 13).

## 7. Review and update existing unit tests (MANDATORY)

- [ ] 7.1 Update the existing tests that expected three player buttons, a disabled Pause or Stop, the old visible toggle text, two pictures in the opened card, the raw duration and speed values, or the old admin labels. No accessible-name query may change, except the player's.

## 8. Run unit tests and verify database state (MANDATORY)

- [ ] 8.1 Record the application database's row counts and the database file's checksum. Then run:
  - the targeted tests;
  - the full frontend and backend suites;
  - typecheck and lint.

  Compare the database afterwards; the change sends no request, so nothing may differ.
- [ ] 8.2 Write `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.

## 9. Manual endpoint testing with curl and E2E (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 No endpoint changes. With a backend on a throwaway data directory and the stub providers, curl `GET /sessions/:id` once, to confirm that the read the page uses is unchanged (`result.imageUrl`, `result.videoUrl`, `requestedDurationSeconds`, `speedFactor`). Delete the directory. Write `reports/YYYY-MM-DD-step-9-curl.md`.
- [ ] 9.2 Browser E2E. Update `e2e/tests/scene-clips.spec.ts` and `e2e/tests/voice-over-player.spec.ts` for the toggle and the conditional Stop, with real playback. Then add checks for:
  - Stop bringing back the poster;
  - opening a second scene closing the first;
  - the opened card holding one picture.

  Run the suite in Chromium and once in WebKit. Take screenshots of the session page and `/admin` in light and dark at 375 and 1440 px, and check that the body never scrolls sideways. Write `reports/YYYY-MM-DD-step-9-e2e.md`.

## 10. Update technical documentation (MANDATORY)

- [ ] 10.1 Update `docs/frontend-standards.md`:
  - the accessible-name rows of the clip and voice-over players (one Play/Pause button, Stop once away from the start);
  - the expand/collapse row (shorter visible text);
  - the providers and failed-stages rows (short visible labels);
  - the Visual Design section (three button weights, `.icon-button`, the dropdown arrow token).
- [ ] 10.2 Run `graphify update .`.
