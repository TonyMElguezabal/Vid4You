## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/rebuild-scene-clip-only` from `feature/JOS-282-redo-scene-narration` (PR #10), after the listen-to-voice-over work is committed on its own branch. Once PR #10 is merged, rebase onto `origin/main`.

## 1. Backend: tests first

- [x] 1.1 Write failing store tests for `markSceneForClipRebuild`. They cover:
  - a `chunk-complete` scene goes to `image-complete`, with its clip result and `scene_video_results` cleared and the attempt fields reset;
  - its `result`, `scene_results`, `IMAGE` instruction and image file are unchanged;
  - `rebuild_count` increments, and `final_video_stale` is set when a final video exists;
  - a given `VIDEO` instruction is stored and recorded, and an omitted one is kept;
  - it returns false and changes nothing for a scene in any other state, or one with no stored image or clip.
- [x] 1.2 Write failing command and route tests for `POST /sessions/:sessionId/scenes/:sceneId/rebuild` with `scope: "clip"`. They cover:
  - 202, and the scene goes `image-complete` → `video-generating` → `chunk-complete` with no image request;
  - the clip request uses the stored image, the scene's bound video provider and the given instruction;
  - the new clip file is `scene-N-rK.mp4`, and the earlier clip is unchanged;
  - no assembly starts in a session with a final video;
  - 400 for `imageInstruction` with `scope: "clip"`, and for an unknown `scope`;
  - 409 `scene-not-ready` for `image-complete`, and `assembly-in-progress` and 404 as for a full rebuild;
  - a held launch (paused session) answers `held: true`, and the clip starts on Continue;
  - clip attempts that exhaust the budget leave the scene `failed` at the video stage, with its image.
- [x] 1.3 Confirm with a test that a rebuild with no `scope`, or with `scope: "image-and-clip"`, behaves exactly as before.

## 2. Backend: implementation

- [x] 2.1 Add `markSceneForClipRebuild` to `db.ts` (design Decision 2).
- [x] 2.2 Add `scope` and its refinement to `rebuildSceneBodySchema`, with a description for the API docs (design Decision 1).
- [x] 2.3 Pass the scope through `rebuildScene`, and launch with `launchVideoStage` for a clip (design Decision 3).
- [x] 2.4 Regenerate `docs/api-spec.yml`.

## 3. Frontend: tests first, then implementation

- [x] 3.1 Write failing component tests for the Rebuild scene form. They cover:
  - a `chunk-complete` scene with a clip shows the "What to rebuild" choice, with "Image and clip" checked;
  - an `image-complete` scene shows no choice;
  - with Clip only:
    - the IMAGE field is hidden;
    - the confirmation sentence is as specified;
    - the submit reads "Rebuild clip";
    - it sends `scope: "clip"` with `videoInstruction` only when the User changed it;
  - an IMAGE edit is not sent with Clip only, and it comes back when the User switches back;
  - "Image and clip" sends no `scope`, as before;
  - a refusal is shown as a sentence.
- [x] 3.2 Add the radio group and the clip-only behavior to `SceneRow` (design Decision 5). Add `scope` to `SceneRebuildHandler` and to `rebuildScene` in `api/client.ts`.
- [x] 3.3 Add styles in `app.css` if the radio group needs them. Check both themes and a 375px width.

## 4. Review and update existing unit tests (MANDATORY)

- [x] 4.1 Update existing tests that assert the exact rebuild body, the form's content, or the rebuild route's schema. Keep the accessible-naming suite passing with the new names.

## 5. Run unit tests and verify database state (MANDATORY)

- [x] 5.1 Record the application database before the tests. Then run:
  - the targeted tests;
  - the full backend and frontend suites;
  - typecheck and lint.

  Compare the database afterwards, and restore it if anything changed.
- [x] 5.2 Write `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`.

## 6. Manual endpoint testing with curl and E2E (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Run a backend with a throwaway data directory and the stub providers. Then:
  - create a session and let it reach `final-video`;
  - curl a clip-only rebuild of one scene, and check that the image path is unchanged and that the clip path carries `-r1`;
  - curl the 400 (`imageInstruction` with `clip`), the 409s, and a full rebuild with no `scope`;
  - delete the directory.

  Write `reports/YYYY-MM-DD-step-6-curl.md`.
- [x] 6.2 Browser E2E: add `e2e/tests/scene-rebuild-clip-only.spec.ts` to the Playwright suite. It checks:
  - opening Rebuild scene and choosing Clip only hides the IMAGE field;
  - confirming "Rebuild clip" keeps the scene's image on its card, and the scene reaches complete again with a new clip URL;
  - "Rebuild final video" is offered afterwards.

  Take screenshots of the form in light and dark at 375 and 1440px. Write `reports/YYYY-MM-DD-step-6-e2e.md`.

## 7. Update technical documentation (MANDATORY)

- [x] 7.1 Add the form's new accessible names to `docs/frontend-standards.md`. Note `scope` in `docs/backend-standards.md` if it describes the rebuild route. Check `docs/PRD.md` for the Rebuild scene description, and add the Clip only choice there. Run `graphify update .`.
