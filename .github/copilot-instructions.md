# Copilot instructions for Vid4You

## Project shape

This repository is a multi-package app, not a single app rooted at the top level:

- `backend/` is a TypeScript + Fastify API for the Vid4You workflow. It uses Zod validation and generated OpenAPI from the route schemas, and exposes a Swagger UI at `/docs`.
- `frontend/` is a React + Vite client that consumes the backend via the API client and uses SSE/EventSource for live session updates.
- `docs/` and `openspec/` contain the product PRD, spec-driven work, and backlog decisions. The root `README.md` is the product/architecture overview, not a build guide.
- `AGENTS.md`, `CLAUDE.md`, and similar AI instruction files in the repo should be treated as project-level guidance; do not drift away from their conventions when working in this repo.

## Build, test, and verification commands

Run commands inside the package that owns the work; there is no repo-wide workspace script.

### Backend

```bash
cd backend
npm install
npm run typecheck
npm test
npm test -- --run test/session-creation.test.ts
npm start
```

- `npm run typecheck` runs `tsc --noEmit`.
- `npm test` runs the backend Vitest suite.
- `npm test -- --run <path-or-pattern>` is the way to run a single backend test file or subset.
- `npm start` boots the Fastify server on `PORT` (default `3100`).
- There is no root-level lint script and no standalone lint command configured in this repo.

### Frontend

```bash
cd frontend
npm install
npm run typecheck
npm run build
npm test
npm test -- --run test/components.test.tsx
npm run dev
```

- `npm run typecheck` runs TypeScript without emitting files.
- `npm run build` runs `tsc --noEmit && vite build`.
- `npm test` runs the frontend Vitest suite.
- `npm test -- --run <path-or-pattern>` is the way to run a single frontend test file.
- `npm run dev` starts the Vite dev server.

## High-level architecture

### Backend architecture

The backend is structured around orchestration and persistence rather than a generic CRUD API:

- `backend/src/server.ts` builds the Fastify app, registers CORS, Swagger/OpenAPI, and the routes module, then boots the server in main-module mode.
- `backend/src/routes.ts` is the public API surface. Route validation is expressed with Zod and Fastify Zod providers; the API contract is generated from those schemas instead of being hand-maintained.
- `backend/src/orchestrator.ts` and `backend/src/sessionStateMachine.ts` hold the session/chunk state machine logic and the retry/continuation behavior. This is where business constraints live.
- `backend/src/db.ts` is the state store and persistence layer. It is not just a helper; it is the place that enforces session and scene state transitions.
- `backend/src/config/providers.ts` contains the supported language/provider configuration, which the route layer consumes rather than duplicating.
- `backend/src/concurrency.ts` and `backend/src/provider.ts` model the provider concurrency and request lifecycle.

The key product design pattern is: session-scoped state + scene-level work + provider-backed stages, with the backend acting as the single source of truth for progress and retries.

### Frontend architecture

The frontend is intentionally simple and state-driven:

- `frontend/src/App.tsx` is the top-level page selector: if there is no `?sessionId=` in the URL, the app shows the “start project” form. If a session exists, it renders the session page.
- `frontend/src/api/client.ts` is the backend boundary; all API calls go through that layer.
- `frontend/src/api/useLiveSession.ts` is the single hook responsible for listening to server events via `EventSource`, catching up with a refresh snapshot, and handling reconnect/not-found behavior.
- `frontend/src/components/*` contains the UI for the start form, session header, scene list, and final video download interactions.

The product convention is to keep the session id in the URL as the user-facing handle for a project; the frontend does not invent a separate project list or user account flow.

## Key conventions in this repo

- Use the package-local toolchain. The repo is split into separate `backend` and `frontend` npm projects with independent `package.json` and lockfiles.
- Keep API validation and the contract in sync. If you change the backend input/output schema, update the Zod declarations in `backend/src/routes.ts` and the client usage in `frontend/src/api/client.ts` together.
- Prefer the existing state machine and orchestration patterns. Session transitions and retries live in the backend orchestration layer; do not bypass them with ad hoc checks in routes or clients.
- Treat the frontend as a thin client around the backend. Live state should flow through `useLiveSession` and the API client rather than being reconstructed locally.
- Maintain the single-user prototype assumptions already present in the codebase: no auth layer, no global project dashboard, and no extra product UX beyond what the PRD and code define.
- For tests, use Vitest in the package where the code lives. The repo expects targeted tests over broad suites when iterating on a change.
- Preserve the backend’s use of Fastify + Zod + Swagger generation and the frontend’s use of React + Vite + Vitest. These are the repo’s deliberate stack choices.

## Useful starting points

When joining this repo, read these in order:

1. `README.md` — product/architecture overview
2. `backend/README.md` — backend stack and experimental design notes
3. `backend/src/server.ts` — app bootstrapping and routing registration
4. `backend/src/routes.ts` — public API surface and validation
5. `frontend/src/App.tsx` — top-level client flow
6. `frontend/src/api/useLiveSession.ts` — live session synchronization contract

## AI guidance already in repo

This repo already includes AI-specific project guidance in:

- `AGENTS.md`
- `CLAUDE.md`

Follow those instructions in addition to this file when they are relevant to the task.
