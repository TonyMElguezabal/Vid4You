## Context

`createElevenLabsVoiceProvider` in `backend/src/voiceProvider.ts` posts `{ text, model_id, language_code }` (plus `voice_settings.speed` when set) to `/v1/text-to-speech/{voiceId}/with-timestamps`. The provider's default `apply_text_normalization` is `"auto"`: it decides per request whether to rewrite numbers. In a real run it often did not, or did so wrongly. The model in use is `eleven_multilingual_v2`, which supports the parameter.

Evidence: nine failing sentences from the run were synthesised twice with the same voice and model, once with the default and once with `"on"`, and transcribed with ElevenLabs speech-to-text. The default reproduced the errors. `"on"` read all nine correctly.

## Goals / Non-Goals

**Goals:**
- Numbers, currency, percentages and ordinals in the script are spoken correctly.
- The stored script and the text sent stay identical.

**Non-Goals:**
- Converting numbers to words in our own code. If `"on"` proves insufficient on a full script, that is a separate change.
- Making normalisation configurable per session or in `/admin`.
- Changing the alignment step. Forced alignment receives the original script and the audio, and is unaffected.
- Supporting a voice model that rejects the parameter. Only `eleven_multilingual_v2` is configured today.

## Decisions

1. **Send `apply_text_normalization: "on"` always, as a constant, not a setting.** Same shape as the hard-coded `with-timestamps` route. No setting is added because no case wants `"auto"` or `"off"`.
2. **Leave the text untouched.** The requirement that the script is sent unaltered stays true. Normalisation happens inside the provider.
3. **Reuse the existing request builder.** One field is added to the `body` object. No new module or helper.

## Risks / Trade-offs

- **Normalisation by the provider is not deterministic.** One run per sentence showed no errors with `"on"`, but a full script may still contain a misread. Mitigation: the manual check below re-synthesises a full script and transcribes it. If misreads remain, a follow-up change converts numbers to words ourselves.
- **Some models reject the parameter.** A future model change could make requests fail with an HTTP 4xx. Mitigation: the existing 4xx classification surfaces it as a failed attempt. Revisit the constant when the model changes.
- **Slight added latency.** Accepted, one request per session.
