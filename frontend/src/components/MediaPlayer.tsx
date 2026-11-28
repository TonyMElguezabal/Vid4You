import { useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * watch-scene-clips (JOS-281), design Decision 5; listen-to-voice-over, design Decision 3 — the media playing now on
 * the page, a scene clip or the voice-over, so starting another one pauses it.
 */
let playingMedia: HTMLMediaElement | null = null;

interface Props {
  kind: "video" | "audio";
  /** Already resolved against the API base. A new URL needs a new player: render with `key={src}`. */
  src: string;
  /** A video's image, shown until it plays. */
  poster?: string;
  /** The buttons' object: "Play {name}" ("scene 2 clip", "voice-over"). */
  name: string;
  /** The media element's own label ("Scene 2 clip", "Voice-over"). */
  mediaLabel: string;
  groupLabel: string;
  /** Shown when the media cannot be loaded or played. */
  failure: string;
  className: string;
  mediaClassName?: string;
}

/**
 * watch-scene-clips (JOS-281), design Decisions 4-6; listen-to-voice-over, design Decision 3 — stored media with Play,
 * Pause and Stop and no other control. Nothing is downloaded before Play (`preload="none"`); the button states follow
 * the element's own events.
 * polish-scene-and-admin-ui, design Decisions 1-2 — Play and Pause are one icon button named after what it does next;
 * Stop is shown only once the media has left its start.
 */
export function MediaPlayer({ kind, src, poster, name, mediaLabel, groupLabel, failure, className, mediaClassName }: Props) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [failed, setFailed] = useState(false);

  function play() {
    const media = mediaRef.current;
    if (!media) return;
    setFailed(false);
    // Claimed on the press, not only on the `play` event, so two quick presses never leave two players loading and playing.
    if (playingMedia && playingMedia !== media) playingMedia.pause();
    playingMedia = media;
    // An AbortError only means a pause (Stop, or another player starting) interrupted the start: nothing failed.
    media.play().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== "AbortError") setFailed(true);
    });
  }

  function stop() {
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    // load() rewinds and brings the poster back; with preload="none" it downloads nothing. It also discards the
    // queued "pause" event, so the playing state is left here rather than in onPause.
    media.load();
    stopped();
    setAtStart(true);
    // Stop disappears, so the focus moves to the toggle rather than to the page body.
    toggleRef.current?.focus();
  }

  function stopped() {
    setPlaying(false);
    if (playingMedia === mediaRef.current) playingMedia = null;
  }

  const mediaProps = {
    ref: mediaRef,
    className: mediaClassName,
    src,
    preload: "none",
    "aria-label": mediaLabel,
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      if (playingMedia && playingMedia !== event.currentTarget) playingMedia.pause();
      playingMedia = event.currentTarget;
      setPlaying(true);
      setAtStart(false);
    },
    onPause: stopped,
    onEnded: stopped,
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => setAtStart(event.currentTarget.currentTime === 0),
    onError: () => {
      stopped();
      setFailed(true);
    },
  };

  return (
    <div className={`media-player ${className}`} role="group" aria-label={groupLabel}>
      {kind === "video" ? <video {...mediaProps} poster={poster} playsInline /> : <audio {...mediaProps} />}
      <div className="transport">
        <button
          ref={toggleRef}
          type="button"
          className="icon-button"
          aria-label={`${playing ? "Pause" : "Play"} ${name}`}
          title={playing ? "Pause" : "Play"}
          onClick={playing ? () => mediaRef.current?.pause() : play}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        {(playing || !atStart) && (
          <button type="button" className="icon-button" aria-label={`Stop ${name}`} title="Stop" onClick={stop}>
            <Icon name="stop" />
          </button>
        )}
      </div>
      {failed && <p role="status">{failure}</p>}
    </div>
  );
}
