/** redo-scene-narration (JOS-282) — each narration take refusal as a sentence the User reads, never a code. */
const NARRATION_TAKE_REFUSAL_SENTENCES: Record<string, string> = {
  "unknown-scene": "This scene could not be found.",
  "invalid-range": "The last scene must come after the first one.",
  "too-long": "These scenes have too much text to read again at once. Choose fewer scenes.",
  "narration-not-located": "The narration of these scenes cannot be found in the timestamps, so it cannot be read again.",
  "take-in-progress": "A new reading is already being made or waiting for review.",
  "assembly-in-progress": "The final video is being built. Try again when it finishes.",
  "unknown-take": "This new reading could not be found.",
  "take-not-open": "This new reading was already kept or discarded.",
  "take-not-ready": "This new reading is not ready to keep.",
};

export function narrationTakeRefusalSentence(reason: string): string {
  return NARRATION_TAKE_REFUSAL_SENTENCES[reason] ?? "The action could not be completed.";
}
