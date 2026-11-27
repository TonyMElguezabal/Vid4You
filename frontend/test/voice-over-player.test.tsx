import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../src/api/client";
import { SessionPage } from "../src/components/SessionPage";
import type { NarrationView, PhaseProgress, SceneEventPayload, SessionEventPayload } from "../src/types";

// listen-to-voice-over — the Voice-over section plays the current narration with Play, Pause and Stop, from the
// moment the voice-over is stored (spec: voice-over-playback; design Decisions 3-5).

const noop = async () => {};
const audioUrl = (version: number) => `/sessions/s1/narration/audio?v=${version}`;

function sessionWith(narration: NarrationView | undefined, voiceOver: PhaseProgress["status"] = "complete"): SessionEventPayload {
  const phases: PhaseProgress[] = [
    { phase: "voice-over", status: voiceOver, heldCount: 0, stages: [] },
    ...(["decomposition", "scenes", "assembly"] as const).map((phase) => ({ phase, status: "pending" as const, heldCount: 0, stages: [] })),
  ];
  return {
    type: "session",
    sessionId: "s1",
    title: "A title",
    script: "A script.",
    language: "en",
    state: "voice-over-complete",
    paused: false,
    held: [],
    running: [],
    phases,
    ...(narration ? { narration } : {}),
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
  };
}

const withClip = (index: number): SceneEventPayload => ({
  type: "scene",
  sessionId: "s1",
  sceneId: `scene-${index}`,
  index,
  state: "chunk-complete",
  stages: {},
  instruction: "",
  updatedAt: "2026-11-27T00:00:00.000Z",
  result: { imageUrl: `/sessions/s1/scenes/scene-${index}/image`, videoUrl: `/sessions/s1/scenes/scene-${index}/clip` },
});

const pageProps = { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", notFound: false, onStartNew: () => {}, onPause: noop, onContinue: noop, onRetry: noop, onCorrect: noop, onRetryPhase: noop };
const renderPage = (session: SessionEventPayload, scenes: SceneEventPayload[] = []) => render(<SessionPage {...pageProps} snapshot={{ session, scenes }} />);

// jsdom has no media playback: play() and pause() fire the events a browser would, and currentTime is a plain value.
let playResult: () => Promise<void>;
let playSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  playResult = () => Promise.resolve();
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    const result = playResult();
    result.then(() => this.dispatchEvent(new Event("play")), () => {});
    return result;
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  const times = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return times.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, value: number) {
      times.set(this, value);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as Partial<HTMLMediaElement>).currentTime;
});

const audio = () => screen.getByLabelText<HTMLAudioElement>("Voice-over");
const button = (action: "Play" | "Pause" | "Stop") => screen.getByRole("button", { name: `${action} voice-over` });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("The Voice-over section shows the player once the voice-over is stored", () => {
  it("shows Play, Pause and Stop in the Voice-over section before any scene, loading nothing", () => {
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));

    const section = screen.getByRole("region", { name: "Voice-over phase" });
    const player = within(section).getByRole("group", { name: "Voice-over player" });
    expect(within(player).getByLabelText("Voice-over").tagName).toBe("AUDIO");
    expect(audio()).toHaveAttribute("src", `${API_BASE}${audioUrl(1)}`);
    expect(audio()).toHaveAttribute("preload", "none");
    expect(audio()).not.toHaveAttribute("controls");
    expect(button("Play")).toBeEnabled();
    expect(button("Pause")).toBeDisabled();
    expect(button("Stop")).toBeDisabled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("shows no player while the voice-over is generating", () => {
    renderPage(sessionWith(undefined, "in-progress"));

    expect(screen.queryByRole("group", { name: "Voice-over player" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play voice-over" })).not.toBeInTheDocument();
  });
});

describe("Play, Pause and Stop", () => {
  it("plays, pauses keeping the position, resumes, then stops at the start", async () => {
    const user = userEvent.setup();
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));

    await user.click(button("Play"));
    expect(button("Play")).toBeDisabled();
    expect(button("Pause")).toBeEnabled();
    expect(button("Stop")).toBeEnabled();

    audio().currentTime = 7;
    fireEvent.timeUpdate(audio());
    await user.click(button("Pause"));
    expect(audio().currentTime).toBe(7);
    expect(button("Play")).toBeEnabled();
    expect(button("Stop")).toBeEnabled();

    await user.click(button("Play"));
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(audio().currentTime).toBe(7);

    await user.click(button("Stop"));
    expect(audio().currentTime).toBe(0);
    expect(button("Play")).toBeEnabled();
    expect(button("Pause")).toBeDisabled();
    expect(button("Stop")).toBeDisabled();
  });

  it("is ready to play again when the narration ends", async () => {
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));
    await userEvent.setup().click(button("Play"));

    fireEvent.ended(audio());

    expect(button("Play")).toBeEnabled();
    expect(button("Pause")).toBeDisabled();
  });

  it("loads a new version from the start, not playing", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));
    await user.click(button("Play"));
    const before = audio();

    rerender(<SessionPage {...pageProps} snapshot={{ session: sessionWith({ version: 2, audioUrl: audioUrl(2) }), scenes: [] }} />);

    expect(audio()).not.toBe(before);
    expect(audio()).toHaveAttribute("src", `${API_BASE}${audioUrl(2)}`);
    expect(button("Play")).toBeEnabled();
    expect(button("Stop")).toBeDisabled();
  });
});

describe("One player plays at a time on the session page", () => {
  it("pauses a playing scene clip when the voice-over starts, and the voice-over when a clip starts", async () => {
    const user = userEvent.setup();
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }), [withClip(2)]);
    const clip = screen.getByLabelText<HTMLVideoElement>("Scene 2 clip");
    const pauseClip = vi.spyOn(clip, "pause");
    const pauseVoiceOver = vi.spyOn(audio(), "pause");

    await user.click(screen.getByRole("button", { name: "Play scene 2 clip" }));
    await user.click(button("Play"));
    expect(pauseClip).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play scene 2 clip" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Play scene 2 clip" }));
    expect(pauseVoiceOver).toHaveBeenCalledTimes(1);
    expect(button("Play")).toBeEnabled();
  });
});

describe("A narration that cannot be played", () => {
  it("says so when the audio fails to load, and Play stays available", () => {
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));

    fireEvent.error(audio());

    expect(screen.getByRole("status")).toHaveTextContent("The voice-over could not be played.");
    expect(button("Play")).toBeEnabled();
  });

  it("says so when the browser refuses to play", async () => {
    renderPage(sessionWith({ version: 1, audioUrl: audioUrl(1) }));
    playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));

    await userEvent.setup().click(button("Play"));
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent("The voice-over could not be played.");
  });
});
