import { useRef, useState } from "react";
import { Icon } from "./Icon";

/** watch-scene-clips (JOS-281), design Decision 5 — the scene clip playing now, so starting another one pauses it. */
let playingClip: HTMLVideoElement | null = null;

interface Props {
  sceneIndex: number;
  /** The clip route, already resolved against the API base. A new URL (a rebuild) needs a new player: render with `key={src}`. */
  src: string;
  /** The scene's image, shown until the clip plays. */
  poster?: string;
}

/**
 * watch-scene-clips (JOS-281), design Decisions 4-6 — a scene's stored clip with Play, Pause and Stop and no other
 * control. Nothing is downloaded before Play (`preload="none"`); the button states follow the element's own events.
 */
export function SceneClipPlayer({ sceneIndex, src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [failed, setFailed] = useState(false);
  const name = `scene ${sceneIndex} clip`;

  function play() {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    // Claimed on the press, not only on the `play` event, so two quick presses never leave two clips loading and playing.
    if (playingClip && playingClip !== video) playingClip.pause();
    playingClip = video;
    // An AbortError only means a pause (Stop, or another clip starting) interrupted the start: nothing failed.
    video.play().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== "AbortError") setFailed(true);
    });
  }

  function stop() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setAtStart(true);
  }

  function stopped() {
    setPlaying(false);
    if (playingClip === videoRef.current) playingClip = null;
  }

  return (
    <div className="scene-clip-player" role="group" aria-label={`Scene ${sceneIndex} clip player`}>
      <video
        ref={videoRef}
        className="scene-clip"
        src={src}
        poster={poster}
        preload="none"
        playsInline
        aria-label={`Scene ${sceneIndex} clip`}
        onPlay={(event) => {
          if (playingClip && playingClip !== event.currentTarget) playingClip.pause();
          playingClip = event.currentTarget;
          setPlaying(true);
          setAtStart(false);
        }}
        onPause={stopped}
        onEnded={stopped}
        onTimeUpdate={(event) => setAtStart(event.currentTarget.currentTime === 0)}
        onError={() => {
          stopped();
          setFailed(true);
        }}
      />
      <div className="scene-clip-controls">
        <button type="button" aria-label={`Play ${name}`} disabled={playing} onClick={play}>
          <Icon name="play" />
          Play
        </button>
        <button type="button" aria-label={`Pause ${name}`} disabled={!playing} onClick={() => videoRef.current?.pause()}>
          <Icon name="pause" />
          Pause
        </button>
        <button type="button" aria-label={`Stop ${name}`} disabled={!playing && atStart} onClick={stop}>
          <Icon name="stop" />
          Stop
        </button>
      </div>
      {failed && <p role="status">Scene {sceneIndex} clip could not be played.</p>}
    </div>
  );
}
