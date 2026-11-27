import { useState } from "react";
import { pauseRefusalSentence } from "../pauseRefusals";
import type { FinalVideoStatus } from "../types";
import { Icon } from "./Icon";

interface Props {
  url: string | undefined;
  /** adjust-scene-pause (JOS-190) — the version and whether a rebuild would change it; absent on a read that predates it. */
  finalVideo?: FinalVideoStatus;
  /** True while a rebuild is running: the previous version stays downloadable. */
  rebuilding?: boolean;
  /** Starts a rebuild; rejects with the refusal reason. */
  onRebuild?: () => Promise<unknown>;
  /** redo-scene-narration (JOS-282), Decision 15 — a narration take is generating or waiting for review: no rebuild yet. */
  takeOpen?: boolean;
}

/** PRD §12.3 — the final MP4 is offered only when the session read publishes
 * a route for it (download-final-video, JOS-164, design Decision 2); nothing
 * is offered for the MP3, timestamps or generated texts (out of scope for
 * the UI entirely, not just gated).
 *
 * redesign-visual-design (JOS-198) — until it is published, the card says so instead of staying empty.
 *
 * adjust-scene-pause (JOS-190), Decision 10 — the version, a rebuild only while pause edits are pending, and a
 * failed rebuild's cause. The download always serves the current version, including while a rebuild runs. */
export function FinalVideoDownload({ url, finalVideo, rebuilding, onRebuild, takeOpen }: Props) {
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  if (!url) return <p className="final-video final-video-pending">Available once every scene is done</p>;

  async function rebuild() {
    if (!onRebuild) return;
    setPending(true);
    setRefusal(null);
    try {
      await onRebuild();
    } catch (error) {
      setRefusal(pauseRefusalSentence(error instanceof Error ? error.message : "", "The rebuild could not be started."));
    } finally {
      setPending(false);
    }
  }

  // rebuild-scene (JOS-235) — also when a scene was rebuilt after this version, e.g. the automatic rebuild did not finish.
  const changed = Boolean(finalVideo?.pendingPauseEdits || finalVideo?.staleScenes);
  const offerRebuild = changed && Boolean(onRebuild) && !rebuilding && !takeOpen;
  return (
    <div className="final-video">
      <div className="final-video-actions">
        <a className="button primary large" href={url}>
          <Icon name="download" />
          Download final video
        </a>
        {finalVideo && <span className="final-video-version">Version {finalVideo.version}</span>}
        {offerRebuild && (
          <button type="button" disabled={pending} onClick={() => void rebuild()}>
            <Icon name="retry" />
            Rebuild final video
          </button>
        )}
      </div>
      {rebuilding && <p className="final-video-note">A new version is being built. The previous version stays available.</p>}
      {/* redo-scene-narration (JOS-282), Decision 15 — nothing is rebuilt by itself: the User checks every scene first. */}
      {finalVideo?.staleScenes && !rebuilding && (
        <p className="final-video-note">This version predates your changes. Check every scene, then rebuild the final video.</p>
      )}
      {changed && takeOpen && !rebuilding && <p className="final-video-note">Keep or discard the new narration before rebuilding the final video.</p>}
      {finalVideo?.rebuildFailure && !rebuilding && (
        <div className="callout callout-failed">
          <Icon name="failed" />
          <p role="alert">{finalVideo.rebuildFailure.cause}</p>
        </div>
      )}
      {refusal && <p role="status">{refusal}</p>}
    </div>
  );
}
