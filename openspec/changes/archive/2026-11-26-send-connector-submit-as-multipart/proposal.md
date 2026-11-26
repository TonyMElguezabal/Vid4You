## Why

Viggle's H3 create call (`POST /v1/videos`) accepts only `multipart/form-data`. The configured connector sends the submit step as JSON, so the Administrator cannot add Viggle on `/admin`. In a ten-scene comparison (2026-11-26) Viggle was the cheapest of the three candidate APIs (USD 0.01 per clip second at 768p) and passed the most scenes of the three (3 of 10; the current MiniMax H3 passed 4).

## What Changes

- The submit step of a connector definition accepts an optional `multipartField`. When set, the body's fields are sent as form fields and the scene image as a file part with that name.
- Save-time checks for that option.
- A verified Viggle definition in `docs/video-connector-definitions.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `configured-video-connector`: the submit step can be sent as a multipart form that carries the scene image.

## Impact

- `backend/src/videoConnector.ts`, `backend/src/providerTypes.ts`, their tests and fixtures, and the docs page.
- No API, database or frontend change. Existing definitions behave as before.
- An installed build needs repackaging before it can use the option. An older build ignores it and would send JSON.
- Non-goals: making Viggle the active provider, saving a key, adding Boreal or Pika.
