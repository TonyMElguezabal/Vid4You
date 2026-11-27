import type { NarrationEdit } from "./assemblyTool.ts";
import { currentNarration, getRun } from "./db.ts";
import { readStoredCharacters } from "./sessionPauses.ts";
import { buildSubtitleCues, type SubtitleCue } from "./subtitles.ts";

// add-burned-in-subtitles (JOS-237), design Decision 3 — the cues of one assembly, built from the session's script and
// stored character timestamps and moved by the pause edits the build applies. Returns null when they cannot be built
// (no stored timestamps, an unreadable file, or characters that do not match the script); it is the assembly tool,
// where subtitles are really drawn, that turns that into a not-retryable failure.

export function buildAssemblySubtitles(runId: string, edits: readonly NarrationEdit[], videoSeconds: number): SubtitleCue[] | null {
  const run = getRun(runId);
  // redo-scene-narration (JOS-282), design Decision 2 — the current narration's timestamps (a kept take's, else the original).
  const timestampsPath = currentNarration(runId)?.timestampsPath;
  if (!run || !timestampsPath) return null;
  const characters = readStoredCharacters(run.projectFolder, timestampsPath);
  if (!characters) return null;
  try {
    return buildSubtitleCues(run.script, characters, edits, videoSeconds);
  } catch {
    return null;
  }
}
