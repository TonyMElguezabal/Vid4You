import { MediaPlayer } from "./MediaPlayer";

/** listen-to-voice-over, design Decisions 3-5 — the session's current narration with Play, Pause and Stop. Render with `key={src}`. */
export function VoiceOverPlayer({ src }: { src: string }) {
  return (
    <MediaPlayer
      kind="audio"
      src={src}
      name="voice-over"
      mediaLabel="Voice-over"
      groupLabel="Voice-over player"
      failure="The voice-over could not be played."
      className="voice-over-player"
    />
  );
}
