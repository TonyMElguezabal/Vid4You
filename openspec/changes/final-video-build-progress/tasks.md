## 0. Setup (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/final-video-build-progress` from `feature/JOS-282-redo-scene-narration` (PR #10). Once PR #10 is merged, rebase it onto `origin/main`.

## 1. Backend: tests first

- [x] 1.1 Write a failing test that the app answers during an assembly. With the real ffmpeg tool, slowed down by a large frame count on a small test clip, check that:
  - a session read answers while the assembly is running;
  - `POST …/final-video/rebuild` answers 202 before the assembly ends.
- [x] 1.2 Write failing tests for the progress arithmetic (design Decision 2). They cover:
  - clips done out of the total, and the percentage after each clip;
  - the encoding step from 50%;
  - the cap at 99, and that it never decreases;
  - frame reports above the target;
  - 100 is never reported by the tool.
- [x] 1.3 Write failing tests for the ffmpeg helper (design Decision 1). They cover:
  - `frame=` lines reach `onFrame`;
  - a non-zero exit rejects with stderr in the message;
  - the tool turns it into `failed_transient`, as before.
- [x] 1.4 Write failing tests for the session read and the live updates (design Decision 4). They cover:
  - `assemblyProgress` is present only while an attempt runs, and is cleared on success, failure and refusal;
  - a retry starts again from 0;
  - a broadcast on each step change, and at most one per second within a step.

## 2. Backend: implementation

- [x] 2.1 Add `runFfmpeg` and the asynchronous ffprobe helpers, and make `assemble()` await them (design Decision 1). Report progress through `onProgress` (design Decisions 2 and 3). Make the stub assembly tool report both steps.
- [x] 2.2 Keep the progress per session in the orchestrator, put `assemblyProgress` in the session read and its response schema, and throttle the broadcast (design Decision 4).
- [x] 2.3 Regenerate `docs/api-spec.yml`.

## 3. Frontend: tests first, then implementation

- [x] 3.1 Write failing component tests for `FinalVideoDownload` and the Final video section. They cover:
  - the bar named "Final video progress", its value and its line in each step;
  - "Waiting to start", with no value;
  - the bar on the first build, instead of "Available once every scene is done";
  - a disabled "Download final video" and the note while rebuilding;
  - enabled again after success and after a failure, with the cause shown;
  - the bar disappears when the build ends.
- [x] 3.2 Implement the bar and the disabled download (design Decision 5). Add `AssemblyProgress` to the types. Style `<progress>` with the existing tokens for both themes and a 375px width.

## 4. Review and update existing unit tests (MANDATORY)

- [x] 4.1 Update existing tests that expect:
  - the "previous version stays available" note;
  - an enabled download link while rebuilding;
  - the exact session read without `assemblyProgress`;
  - a synchronous assembly tool (for example, tests that inspect files right after calling `assemble`).

## 5. Run unit tests and verify database state (MANDATORY)

- [x] 5.1 Record the application database before the tests. Then run:
  - the targeted tests;
  - the full backend and frontend suites;
  - typecheck and lint.

  Compare the database afterwards, and restore it if anything changed.
- [x] 5.2 Write `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`.

## 6. Manual endpoint testing with curl and E2E (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Run a backend with a throwaway data directory, the stub voice, image and video providers, and the real ffmpeg assembly tool with stub clips of several seconds. Then:
  - request a rebuild, and check that it answers at once;
  - read the session repeatedly during the assembly, and record `assemblyProgress` going from `preparing-clips` to `encoding` with a rising percentage;
  - check that it is absent at the end;
  - time a session read during the encode;
  - delete the directory.

  Write `reports/YYYY-MM-DD-step-6-curl.md`.
- [x] 6.2 Browser E2E: add `e2e/tests/final-video-build-progress.spec.ts` to the Playwright suite. It checks:
  - after "Rebuild final video", the bar and its line appear;
  - "Download final video" is disabled until the new version is ready;
  - the new version number and an enabled download at the end.

  Take screenshots of the bar in light and dark at 375 and 1440px. Write `reports/YYYY-MM-DD-step-6-e2e.md`.

## 7. Update technical documentation (MANDATORY)

- [x] 7.1 Update the docs:
  - `docs/frontend-standards.md`: the bar's accessible name, and the disabled download;
  - `docs/backend-standards.md`: no synchronous child processes on the request path, and how assembly progress is reported;
  - ADR 0005, if it describes how ffmpeg is called;
  - `docs/PRD.md`, where it says the previous version stays downloadable during a rebuild.

  Run `graphify update .`.
