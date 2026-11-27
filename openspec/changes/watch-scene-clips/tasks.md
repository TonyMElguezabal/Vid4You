## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/JOS-281-watch-scene-clips` from `origin/main`

## 1. Backend: tests first

- [x] 1.1 Failing tests for the session read: `result.videoUrl` set exactly when a clip is stored, with `?r=N` after a rebuild; the live update after a clip is stored carries it; a failed scene keeps `imageUrl` without `videoUrl`
- [x] 1.2 Failing tests for `GET /sessions/:sessionId/scenes/:sceneId/clip`: 200 whole file with `Accept-Ranges` and no attachment; 206 for `start-end`, `start-` and `-suffix`; 416 past the end; a multi-range header answers 200; 404 for no clip, another session's scene, a missing file; a path outside the project folder is refused

## 2. Backend: implementation

- [x] 2.1 Set `result.videoUrl` in `sceneToPayload`
- [x] 2.2 Add the clip route with byte ranges, sharing the stored-file lookup with the image route (design Decision 2, Risks)
- [x] 2.3 Add the route to `docs/api-spec.yml` and the response schema description in `routes.ts`

## 3. Frontend: tests first, then implementation

- [x] 3.1 Failing component tests: player and buttons shown exactly when `result.videoUrl` is present, collapsed and expanded, with one video per scene; `preload="none"` and the image as poster; Play, Pause, resume, Stop back to 0; button states; one clip at a time; error message; a new `videoUrl` reloads from the start; a live update adds the player without a reload
- [x] 3.2 Add `SceneClipPlayer` and use it in `SceneRow`; remove the old details `<video controls>`; styles in `app.css` for both themes and 375px width
- [x] 3.3 Show `Scene {index}` in every card's status line, so the number stays when the clip player replaces the thumbnail and when the card is expanded. Write the failing component test first, for a card before its image, with its image, with its clip, and expanded.

## 4. Review and update existing unit tests (MANDATORY)

- [x] 4.1 Update existing tests that expect no `videoUrl`, or a details `<video controls>`; keep the accessible-naming suite passing with the new names added

## 5. Run unit tests and verify database state (MANDATORY)

- [x] 5.1 Record the application database before the tests, run targeted tests, the full backend and frontend suites, typecheck and lint, and compare afterwards
- [x] 5.2 Write `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`

## 6. Manual endpoint testing with curl and E2E (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 On a backend with a throwaway data directory and the stub providers: run a short session; curl the clip route whole, with each range form, past the end, and for a scene without a clip; delete the directory
- [x] 6.2 Browser E2E: a new test in the project's Playwright suite (`e2e/tests/scene-clips.spec.ts`, run in CI) for the player on the card, nothing loaded before Play, Play/Pause/Stop with real playback; also run once in WebKit; screenshots light and dark at 375 and 1440px. "One clip at a time" stays with the component tests (a stubbed session has one scene)

## 7. Update technical documentation (MANDATORY)

- [x] 7.1 Add the player's accessible names to `docs/frontend-standards.md`; note the clip route in `docs/backend-standards.md` if it lists the scene routes; `graphify update .`
