import { useState } from "react";
import { pauseRefusalSentence } from "../pauseRefusals";
import type { AssemblyProgress, FinalVideoStatus } from "../types";
import { Icon } from "./Icon";

interface Props {
  url: string | undefined;
  /** adjust-scene-pause (JOS-190) — the version and whether a rebuild would change it; absent on a read that predates it. */
  finalVideo?: FinalVideoStatus;
  /** final-video-build-progress — true while a final video is being built: the first one, a retry or a rebuild. */
  building?: boolean;
  /** How far the build is; absent until the assembly reports. */
  progress?: AssemblyProgress;
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
export function FinalVideoDownload({ url, finalVideo, building, progress, onRebuild, takeOpen }: Props) {
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const bar = building ? <BuildProgress progress={progress} /> : null;
  if (!url) return bar ? <div className="final-video">{bar}</div> : <p className="final-video final-video-pending">Available once every scene is done</p>;
  // A session that already has a final video and is building one again is rebuilding (JOS-190, Decision 7).
  const rebuilding = Boolean(building);

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
        {/* final-video-build-progress — a link cannot be disabled; a disabled button keeps the name. */}
        {rebuilding ? (
          <button type="button" className="primary large" disabled>
            <Icon name="download" />
            Download final video
          </button>
        ) : (
          <a className="button primary large" href={url}>
            <Icon name="download" />
            Download final video
          </a>
        )}
        {finalVideo && <span className="final-video-version">Version {finalVideo.version}</span>}
        {offerRebuild && (
          <button type="button" disabled={pending} onClick={() => void rebuild()}>
            <Icon name="retry" />
            Rebuild final video
          </button>
        )}
      </div>
      {bar}
      {rebuilding && <p className="final-video-note">The download is available again when the new version is ready.</p>}
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

/** final-video-build-progress, design Decision 5 — a native bar; with no progress yet it has no value (indeterminate). */
function BuildProgress({ progress }: { progress: AssemblyProgress | undefined }) {
  const line = !progress
    ? "Waiting to start"
    : progress.step === "preparing-clips"
      ? `Preparing clips: ${progress.clipsDone} of ${progress.clipsTotal}`
      : "Encoding the final video";
  return (
    <div className="final-video-progress">
      <progress max={100} {...(progress ? { value: progress.percent } : {})} aria-label="Final video progress" />
      <p className="final-video-progress-line">
        <span>{line}</span>
        {progress && <span className="final-video-progress-percent">{progress.percent}%</span>}
      </p>
    </div>
  );
}
