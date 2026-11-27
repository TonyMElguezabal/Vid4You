import { useState } from "react";
import { resolveResultUrl } from "../api/client";
import { narrationTakeRefusalSentence } from "../narrationTakeRefusals";
import type { NarrationView, TakeQuote } from "../types";
import { Icon } from "./Icon";

/** redo-scene-narration (JOS-282) — the four narration take commands, bound to the session. Each rejects with the refusal reason. */
export interface NarrationTakeHandlers {
  quote: (firstSceneId: string, lastSceneId: string) => Promise<TakeQuote>;
  create: (firstSceneId: string, lastSceneId: string) => Promise<unknown>;
  keep: (takeId: string) => Promise<unknown>;
  discard: (takeId: string) => Promise<unknown>;
}

/** "scene 3" or "scenes 1 to 2". */
export function sceneRange(first: number, last: number): string {
  return first === last ? `scene ${first}` : `scenes ${first} to ${last}`;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

interface Props {
  narration: NarrationView | undefined;
  handlers: NarrationTakeHandlers;
}

/**
 * redo-scene-narration (JOS-282), design Decision 13 — the session's open take: being read, waiting for review (native
 * audio controls, loaded only on play), or failed. Derived from the session read; nothing is rendered and then disabled.
 */
export function NarrationTakePanel({ narration, handlers }: Props) {
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const take = narration?.take;
  if (!take) return null;
  const range = sceneRange(take.firstSceneIndex, take.lastSceneIndex);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setRefusal(null);
    try {
      await action();
    } catch (error) {
      setRefusal(narrationTakeRefusalSentence(error instanceof Error ? error.message : ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="New narration" className={`narration-take callout ${take.state === "failed" ? "callout-failed" : "callout-info"}`}>
      {take.state === "generating" && <p>{capitalise(range)} {take.firstSceneIndex === take.lastSceneIndex ? "is" : "are"} being read again.</p>}
      {take.state === "ready" && take.previewUrl && (
        <>
          <p>The new reading of {range} is ready. Listen to it with the narration around it, then keep it or discard it.</p>
          <audio controls preload="none" src={resolveResultUrl(take.previewUrl)} aria-label={`New narration of ${range}`} />
          <div className="rebuild-actions">
            <button type="button" className="primary" disabled={pending} onClick={() => void run(() => handlers.keep(take.takeId))}>
              <Icon name="retry" />
              Keep new narration
            </button>
            <button type="button" disabled={pending} onClick={() => void run(() => handlers.discard(take.takeId))}>
              Discard
            </button>
          </div>
        </>
      )}
      {take.state === "failed" && (
        <>
          {/* The cause alone read like an assembly failure under the final video; say what was not changed and what to do. */}
          <p role="alert">
            The new reading of {range} could not be used. {take.failure} The narration and the final video were not changed. Use Redo narration on
            scene {take.firstSceneIndex} to read {take.firstSceneIndex === take.lastSceneIndex ? "it" : "them"} again.
          </p>
          <button type="button" disabled={pending} onClick={() => void run(() => handlers.discard(take.takeId))}>
            Dismiss
          </button>
        </>
      )}
      {refusal && <p role="status">{refusal}</p>}
    </section>
  );
}
