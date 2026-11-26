## Context

`createConfiguredVideoProvider` already builds a `FormData` with the image for the optional upload step. The submit step is JSON only.

## Goals / Non-Goals

**Goals:** Viggle can be added as a definition. **Non-Goals:** new adapter type, form UI change, list or object form values.

## Decisions

1. **`submit.multipartField` instead of a coded Viggle adapter or an `encoding` flag.** It has the same name and meaning as in the upload step, and reuses that code. Sending the image as a data URI in a text field was not chosen: the comparison verified the file part only, and the docs allow a larger upload as a URL than as a file, not a data URI in a text part.
2. **Scalar form values only.** Viggle needs no more. Anything else is refused at save time rather than guessed at.
3. **Viggle parameters are those of the comparison:** `quality` high, `enhance` false (true rewrites the prompt and doubles the price), `watermark` false, `aspect_ratio` 16:9, resolution `768p`, 5 to 15 s. No `seed`, so a retry can give a different clip. `model` is `viggle-h3`, for diagnostics only; the API has no model field.

## Risks / Trade-offs

- [Some 16:9 requests came back as 1280x704 or 1312x736] → the assembly already resizes every clip; these are stretched slightly.
- [Results are deleted 24 hours after a job ends] → the application downloads a clip as soon as it is ready; a longer shutdown loses that paid clip.
- [An older build ignores `multipartField`] → documented; repackage before saving the profile.
