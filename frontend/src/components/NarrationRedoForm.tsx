import { useEffect, useState } from "react";
import { narrationTakeRefusalSentence } from "../narrationTakeRefusals";
import type { TakeQuote } from "../types";
import { Icon } from "./Icon";
import { sceneRange, type NarrationTakeHandlers } from "./NarrationTakePanel";

/** What a scene may redo: itself and the consecutive later scenes that can be redone, with the session's commands. */
export interface NarrationRedoOffer extends Pick<NarrationTakeHandlers, "quote" | "create"> {
  throughScenes: Array<{ sceneId: string; index: number }>;
}

function pauseResetSentence(indexes: number[]): string | null {
  if (indexes.length === 0) return null;
  if (indexes.length === 1) return `The pause you set on scene ${indexes[0]} will be reset.`;
  return `The pauses you set on scenes ${indexes.slice(0, -1).join(", ")} and ${indexes.at(-1)} will be reset.`;
}

/**
 * redo-scene-narration (JOS-282), design Decision 13 — "Redo narration" in a scene's details: an inline form, like
 * Rebuild scene, that quotes each choice of last scene before anything is sent.
 */
export function NarrationRedoForm({ offer }: { offer: NarrationRedoOffer }) {
  const first = offer.throughScenes[0]!;
  const [open, setOpen] = useState(false);
  const [lastSceneId, setLastSceneId] = useState(first.sceneId);
  const [quote, setQuote] = useState<TakeQuote | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { quote: fetchQuote } = offer;

  useEffect(() => {
    if (!open) return;
    let current = true;
    /* eslint-disable react-hooks/set-state-in-effect -- the quote is fetched for each choice of last scene */
    setQuote(null);
    setRefusal(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchQuote(first.sceneId, lastSceneId).then(
      (answer) => current && setQuote(answer),
      (error: unknown) => current && setRefusal(narrationTakeRefusalSentence(error instanceof Error ? error.message : "")),
    );
    return () => {
      current = false;
    };
  }, [open, first.sceneId, lastSceneId, fetchQuote]);

  const last = offer.throughScenes.find((scene) => scene.sceneId === lastSceneId) ?? first;
  const range = sceneRange(first.index, last.index);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setLastSceneId(first.sceneId);
          setOpen(true);
        }}
      >
        <Icon name="retry" />
        Redo scene {first.index} narration
      </button>
    );
  }

  const resetSentence = quote ? pauseResetSentence(quote.pauseEditsReset) : null;
  return (
    <form
      aria-label={`Redo scene ${first.index} narration`}
      className="correction-form narration-redo"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setRefusal(null);
        offer.create(first.sceneId, last.sceneId).then(
          () => {
            setPending(false);
            setOpen(false);
          },
          (error: unknown) => {
            setPending(false);
            setRefusal(narrationTakeRefusalSentence(error instanceof Error ? error.message : ""));
          },
        );
      }}
    >
      <label htmlFor={`redo-through-${first.sceneId}`}>Through scene</label>
      <select id={`redo-through-${first.sceneId}`} value={lastSceneId} onChange={(event) => setLastSceneId(event.target.value)}>
        {offer.throughScenes.map((scene) => (
          <option key={scene.sceneId} value={scene.sceneId}>
            Scene {scene.index}
          </option>
        ))}
      </select>
      {quote && (
        <>
          <blockquote className="narration-redo-text">{quote.text}</blockquote>
          <p>{quote.characters.toLocaleString("en")} characters</p>
          <p>{quote.estimatedCost ? `Estimated cost: ${quote.estimatedCost.amount.toFixed(4)} ${quote.estimatedCost.currency}` : "The price of the voice provider is not set."}</p>
          {resetSentence && <p>{resetSentence}</p>}
        </>
      )}
      <p>
        The voice provider reads this text again, and the reading is billed. You can listen to it before you keep it. Then the final video is
        rebuilt.
      </p>
      <div className="rebuild-actions">
        <button type="submit" className="primary" disabled={pending || !quote}>
          Read {range} again
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {refusal && <p role="status">{refusal}</p>}
    </form>
  );
}
