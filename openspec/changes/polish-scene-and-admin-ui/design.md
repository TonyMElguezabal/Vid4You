## Context

The frontend uses the "Studio" tokens (`styles/tokens.css`) and one stylesheet (`styles/app.css`), with no component library. Recent stories each added their part of the session page and `/admin` on their own:

- watch-scene-clips (JOS-281) added a clip player with three labelled buttons on the scene card.
- listen-to-voice-over extracted that player into `MediaPlayer` and reused it for the narration.
- redo-scene-narration (JOS-282) added the "Narration redone" badge and the Redo narration form to the opened card.
- rebuild-scene-clip-only added a "What to rebuild" choice (Image and clip / Clip only) to the Rebuild form, and watch-scene-clips moved `Scene {index}` into the card's status line.
- admin-tabs-and-tables (JOS-270) grouped `/admin` into tabs, but its sections kept `className="field"`, the column layout made for a single form field.

What the User saw on a real 70-scene session (screenshots in the proposal review):

- Play, Pause and Stop wrap onto two rows in a 184 px card.
- The opened card shows the image, then the clip's poster, which is the same image.
- The speed factor is printed as `1.0159166666666668`.
- The pause field is 100 % wide. Cause: `input:not([type="radio"]):not([type="checkbox"])` (specificity 0,2,1) outranks `.pause-dial-row input` (0,1,1).
- Every action in the opened card is on its own row.

The approved mockup is https://claude.ai/artifact/Vc8e7bHSRasASiJz3Lw4AB.

## Goals / Non-Goals

**Goals:**
- One Play/Pause button and a Stop that appears once it can do something, for the clips and the voice-over.
- One picture per opened scene, and one opened scene at a time.
- Readable values, one action bar, three button weights, a usable pause field and dropdown arrow.
- `/admin` sections with heading rows and right-aligned row actions.
- Keep every accessible name, except that Play and Pause are now one element whose name changes.

**Non-Goals:**
- Changing the clip-only rebuild. `rebuild-scene-clip-only` delivered it; this change only moves its form into the action bar.
- Moving the scene number. It stays in the status line (`watch-scene-clips`, "Every scene card shows its scene number").
- A seek bar, volume, full screen or "play all".
- New colours, fonts or a component library.
- Renaming the scene fields. The opened card keeps the PRD's field names (`PROMPT`, `IMAGE`, `VIDEO`) in normal case ("Prompt", "Image", "Video"). The mockup's "Narration" label is not adopted.
- Restyling the Reports tab, beyond the shared section heading and the dropdown arrow.

## Decisions

1. **`MediaPlayer` renders one toggle and a conditional Stop.** The toggle's name and icon follow `playing`: `Play {name}` and the play icon, or `Pause {name}` and the pause icon. `title` gives the tooltip. Stop renders only when `playing || !atStart`.
   - When Stop is pressed, it disappears. Focus therefore moves to the toggle, so a keyboard user is not dropped to the page body.
   - Alternative: a fixed name "Play" with `aria-pressed`. Rejected: "pressed Play" does not say that pressing it pauses, and the existing names `Pause scene {index} clip` and `Pause voice-over` are kept as states of the one button.
   - Alternative: keep Stop rendered and disabled. Rejected by the User: a disabled control on every card is clutter.

2. **Stop calls `media.load()` after `pause()`.** That brings back the poster, which is the scene image. Setting `currentTime = 0` alone shows the clip's first frame, not the poster.
   - With `preload="none"`, `load()` downloads nothing.
   - A `play()` still pending is aborted with an `AbortError`, which the player already treats as no failure.
   - `load()` discards the `pause` event that `pause()` queued, so Stop leaves the playing state and clears the shared "playing media" reference itself, not through `onPause`.
   - The same applies to the voice-over, where `load()` simply rewinds.

3. **The controls sit over the clip only through CSS.** `.scene-clip-player` is positioned, and its `.transport` bar (the two icon buttons on a translucent dark pill) is absolutely placed bottom-left. The voice-over player shows the same `.transport` inline, as two raised round keys.
   - Neither needs a new prop: the class the caller already passes decides.
   - The pill's background becomes opaque under `prefers-reduced-transparency: reduce`.

4. **`SceneList` owns which scene is open.** It holds `openSceneId: string | null` and passes `expanded` and `onToggleExpanded` to each `SceneRow`, which stops keeping its own `expanded` state.
   - Opening a scene replaces the id, which closes the previous one. Hide details sets it to `null`.
   - Live updates re-render the rows but do not touch the id, so they never open or close anything.
   - Rows stay mounted, so a row's own state (the rebuild form and its drafts) is kept across a close. Content inside the details (the pause field, the narration redo form) unmounts, exactly as with Hide details today.

5. **An opening card scrolls itself into view.** A `useEffect` on `expanded` calls `rowRef.current?.scrollIntoView?.({ block: "nearest" })`.
   - Closing a scene above the new one moves the new one up, sometimes out of view.
   - `nearest` does nothing when the card is already visible.
   - The scroll is instant, so reduced motion needs no special case.
   - The optional call covers jsdom, which has no `scrollIntoView`.

6. **The status line is unchanged.** It keeps `Scene {index}`, the state pill, "Narration redone" and the duration, as UAT has them, wrapping when the card is narrow. A badge on the picture was dropped: it would contradict the scene-number requirement and adds nothing a sighted User needs.

7. **The opened card shows `clipPlayer ?? image`.** The details' media column renders the clip player when `result.videoUrl` exists and the `<img>` otherwise, never both. The collapsed card's frame is not rendered while expanded, so the page still has one player per scene.

8. **Values are formatted where they are shown.**
   - The requested duration is `{n} s`, and the speed factor is `×{speedFactor.toFixed(2)}`.
   - Both go in `.summary-tiles`, the existing tile style from the reports, moved from the `/admin` block of `app.css` to the shared section.
   - Warnings stay next to the value they qualify.
   - No helper module: two template strings in one component.

9. **One action bar, forms inside it.** Retry, the correction form, Rebuild scene and its form (with its Image and clip / Clip only choice unchanged), and `NarrationRedoForm` render inside an `.action-bar`, which comes after the details grid and spans the card.
   - The bar is a right-aligned wrapping flex row, and an open form takes a full line (`flex-basis: 100%`).
   - So `NarrationRedoForm`, which swaps its own button for its form, needs no change.
   - A refusal sentence stays under the bar.
   - The stage diagnostics groups stay as they are, under a small "Providers" heading.

10. **The pause field fix is a selector of equal weight declared later:** `.pause-dial .pause-dial-row input` (0,2,1). The unit "s" moves inside the field as an `aria-hidden` suffix, because the field's name and unit are already given by its label and the range note. Reset becomes quiet.

11. **Three button weights.** The `primary` and default styles exist. `quiet` is new: accent text, no fill, border or shadow until hovered.
    - Quiet is used for Details / Hide details, Reset, Cancel and the downloads.
    - `.icon-button` is new: 32 px square with a transparent 4 px `::after` ring, so the hit area is 40 px.
    - The old `button.toggle` style is replaced by `quiet`.

12. **The dropdown arrow is a token.** `tokens.css` gains `--color-select-arrow`, a `url("data:image/svg+xml,…")` of the app's chevron turned down, defined for both themes with the muted text colour.
    - `select` gets `appearance: none`, the token as its background image at `right 0.75rem center`, and `padding-right: 2.25rem`.
    - A CSS variable can hold a `url()`. This keeps colours in `tokens.css`, which no test parses.

13. **`/admin` sections share one layout.**
    - `className="field"` becomes `admin-section`, with a `section-head` (heading and description). Buttons keep their own width, because the section no longer stretches its children.
    - Active providers become one `active-grid` (stage, select, source text).
    - `.provider-list` and `.provider-row` become `.row-list` and `.row`. Failed stages use them too, replacing the bulleted `<ul>`.
    - Visible labels shorten ("Edit", "Add", "Move", "Duplicate", "Test connection", "Delete", "Send charged test"). The current full strings move to `aria-label`, and each visible label stays a part of its name, so voice control still finds it.
    - The charged-test prompt and the test result become `.callout`s.

14. **Accessible names are unchanged except the toggle.** `docs/frontend-standards.md` is updated: the clip and voice-over rows describe one Play/Pause button and a conditional Stop, and a note says that a visible label may be shorter than its accessible name.

## Risks / Trade-offs

- [Existing unit and E2E tests assert a disabled Pause and Stop] → They are rewritten first, as failing tests (tasks 1 and 3). `e2e/tests/scene-clips.spec.ts` and `e2e/tests/voice-over-player.spec.ts` change with them.
- [`load()` on Stop behaves differently in Safari] → The WebKit E2E run checks that the poster comes back and that Play then starts from 0.
- [The toggle's name changes while it has focus] → Screen readers announce the new name, which is the intended feedback. No live region is added.
- [Scrolling on open can feel jumpy with long details] → `block: "nearest"` scrolls only as far as needed, and only when the card is not fully in view.
- [The base is `UAT`, a merge branch] → The pull request lists the three features it builds on; it merges after them.
- [Two unarchived changes own the modified requirements] → This change is archived after `watch-scene-clips` and `listen-to-voice-over` (task 0.2).

## Migration Plan

Frontend only. No data or API migration. Rollback is reverting the branch.

## Open Questions

None. The User chose the toggle, one picture, one open scene and the dropdown arrow on the mockup.
