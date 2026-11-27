import { MediaPlayer } from "./MediaPlayer";

interface Props {
  sceneIndex: number;
  /** The clip route, already resolved against the API base. A new URL (a rebuild) needs a new player: render with `key={src}`. */
  src: string;
  /** The scene's image, shown until the clip plays. */
  poster?: string;
}

/** watch-scene-clips (JOS-281), design Decisions 4-6 — a scene's stored clip with Play, Pause and Stop (see `MediaPlayer`). */
export function SceneClipPlayer({ sceneIndex, src, poster }: Props) {
  return (
    <MediaPlayer
      kind="video"
      src={src}
      poster={poster}
      name={`scene ${sceneIndex} clip`}
      mediaLabel={`Scene ${sceneIndex} clip`}
      groupLabel={`Scene ${sceneIndex} clip player`}
      failure={`Scene ${sceneIndex} clip could not be played.`}
      className="scene-clip-player"
      mediaClassName="scene-clip"
    />
  );
}
