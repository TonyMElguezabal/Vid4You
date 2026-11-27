import type { NarrationView, SceneEventPayload, SessionState } from "../types";
import type { NarrationRedoOffer } from "./NarrationRedoForm";
import type { NarrationTakeHandlers } from "./NarrationTakePanel";
import { SceneRow, type SceneRebuildHandler } from "./SceneRow";

interface Props {
  scenes: SceneEventPayload[];
  /** distinguish-paused-session (JOS-153) — passed through to each row (design Decision 6). */
  paused?: boolean;
  /** Starts a scene retry; rejects with the refusal reason (retry-or-correct-image, JOS-157). */
  onRetry: (sceneId: string) => Promise<unknown>;
  /** Corrects IMAGE and retries; rejects with the refusal reason. */
  onCorrect: (sceneId: string, instruction: string) => Promise<unknown>;
  /** adjust-scene-pause (JOS-190) — passed through to each row. */
  onSetPause?: (sceneId: string, seconds: number) => Promise<unknown>;
  /** rebuild-scene (JOS-235) — passed through to each row, with the session's state that decides whether it is offered. */
  onRebuild?: SceneRebuildHandler;
  sessionState?: SessionState;
  /** redo-scene-narration (JOS-282) — the session's narration and take commands; absent: Redo narration is not offered. */
  narration?: NarrationView;
  narrationTakes?: NarrationTakeHandlers;
}

/** Redo narration is offered on a redoable scene while no take is open and the final video is not being assembled. */
function narrationRedoOffers(ordered: SceneEventPayload[], narration: NarrationView | undefined, takes: NarrationTakeHandlers | undefined, sessionState: SessionState | undefined): Map<string, NarrationRedoOffer> {
  const offers = new Map<string, NarrationRedoOffer>();
  const takeOpen = narration?.take?.state === "generating" || narration?.take?.state === "ready";
  if (!takes || !narration || takeOpen || sessionState === "final-video-generating") return offers;
  ordered.forEach((scene, position) => {
    if (!scene.narrationRedoable) return;
    const throughScenes: NarrationRedoOffer["throughScenes"] = [];
    for (const later of ordered.slice(position)) {
      if (!later.narrationRedoable) break;
      throughScenes.push({ sceneId: later.sceneId, index: later.index });
    }
    offers.set(scene.sceneId, { throughScenes, quote: takes.quote, create: takes.create });
  });
  return offers;
}

/**
 * PRD §6, AC11, AC21 — always rendered in ascending scene-identifier order,
 * regardless of the order updates arrive in (Decision 6). Sorting on every
 * render, not trusting arrival/array order, is the point of this component
 * existing separately from `SessionView` — see its ordering test.
 */
export function SceneList({ scenes, paused, onRetry, onCorrect, onSetPause, onRebuild, sessionState, narration, narrationTakes }: Props) {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const redoOffers = narrationRedoOffers(ordered, narration, narrationTakes, sessionState);

  return (
    <section aria-label="Scenes">
      {ordered.length === 0 ? (
        // consult-session (JOS-135) Decision 6 — an absent section is shown
        // as "not yet available", never as an error or as silence.
        <p className="scenes-not-yet-available">Scenes are not yet available.</p>
      ) : (
        <ul className="scene-list">
          {ordered.map((scene) => (
            <SceneRow key={scene.sceneId} scene={scene} paused={paused} onRetry={onRetry} onCorrect={onCorrect} onSetPause={onSetPause} onRebuild={onRebuild} sessionState={sessionState} narrationRedo={redoOffers.get(scene.sceneId)} />
          ))}
        </ul>
      )}
    </section>
  );
}
