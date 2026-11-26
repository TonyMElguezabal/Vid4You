import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneList } from "../src/components/SceneList";
import { SceneRow } from "../src/components/SceneRow";
import { API_BASE } from "../src/api/client";
import type { SceneEventPayload } from "../src/types";

// watch-scene-clips (JOS-281) — the scene card plays a stored clip with Play, Pause and Stop; one clip at a time;
// nothing is downloaded before Play (design Decisions 4-6).

function makeScene(overrides: Partial<SceneEventPayload>): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: overrides.sceneId ?? `scene-${overrides.index ?? 1}`,
    index: overrides.index ?? 1,
    state: "chunk-complete",
    stages: {},
    instruction: "",
    updatedAt: "2026-11-26T00:00:00.000Z",
    ...overrides,
  };
}

const imageUrl = (index: number) => `/sessions/s1/scenes/scene-${index}/image`;
const clipUrl = (index: number) => `/sessions/s1/scenes/scene-${index}/clip`;
const withClip = (index: number, overrides: Partial<SceneEventPayload> = {}) =>
  makeScene({ index, result: { imageUrl: imageUrl(index), videoUrl: clipUrl(index) }, ...overrides });
const noop = async () => {};
const props = { onRetry: noop, onCorrect: noop };

// jsdom has no media playback: play() and pause() fire the events a browser would, and currentTime is a plain value.
let playResult: () => Promise<void>;
let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  playResult = () => Promise.resolve();
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    const result = playResult();
    result.then(() => this.dispatchEvent(new Event("play")), () => {});
    return result;
  });
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  let time = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as Partial<HTMLMediaElement>).currentTime;
});

const clip = (index: number) => screen.getByLabelText<HTMLVideoElement>(`Scene ${index} clip`);
const button = (action: "Play" | "Pause" | "Stop", index: number) => screen.getByRole("button", { name: `${action} scene ${index} clip` });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("The scene card shows a stored clip (JOS-281)", () => {
  it("shows the clip and the three buttons on the collapsed card, loading nothing before Play", () => {
    render(<SceneRow scene={withClip(2)} {...props} />);

    const video = clip(2);
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", `${API_BASE}${clipUrl(2)}`);
    expect(video).toHaveAttribute("poster", `${API_BASE}${imageUrl(2)}`);
    expect(video).toHaveAttribute("preload", "none");
    expect(video).not.toHaveAttribute("controls");
    for (const action of ["Play", "Pause", "Stop"] as const) expect(button(action, 2)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View scene 2 details" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows no player and no buttons for a scene without a stored clip", () => {
    render(<SceneRow scene={makeScene({ index: 2, state: "video-generating", result: { imageUrl: imageUrl(2) } })} {...props} />);

    expect(screen.queryByLabelText("Scene 2 clip")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /scene 2 clip/ })).not.toBeInTheDocument();
  });

  it("keeps exactly one player for the scene when its details are expanded", async () => {
    render(<SceneRow scene={withClip(2)} {...props} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "View scene 2 details" }));

    expect(screen.getAllByLabelText("Scene 2 clip")).toHaveLength(1);
    expect(button("Play", 2)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Scene 2 image" })).toBeInTheDocument();
  });

  it("adds the player when a live update brings the clip, without a reload", () => {
    const { rerender } = render(<SceneList {...props} scenes={[makeScene({ index: 2, state: "video-generating", result: { imageUrl: imageUrl(2) } })]} />);
    expect(screen.queryByLabelText("Scene 2 clip")).not.toBeInTheDocument();

    rerender(<SceneList {...props} scenes={[withClip(2)]} />);

    expect(within(screen.getByRole("listitem", { name: "Scene 2" })).getByLabelText("Scene 2 clip")).toBeInTheDocument();
  });
});

describe("Play, Pause and Stop (JOS-281)", () => {
  it("plays, pauses keeping the position, and resumes from it", async () => {
    const user = userEvent.setup();
    render(<SceneRow scene={withClip(2)} {...props} />);
    expect(button("Play", 2)).toBeEnabled();
    expect(button("Pause", 2)).toBeDisabled();
    expect(button("Stop", 2)).toBeDisabled();

    await user.click(button("Play", 2));
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(button("Play", 2)).toBeDisabled();
    expect(button("Pause", 2)).toBeEnabled();
    expect(button("Stop", 2)).toBeEnabled();

    clip(2).currentTime = 3;
    fireEvent.timeUpdate(clip(2));
    await user.click(button("Pause", 2));
    expect(clip(2).currentTime).toBe(3);
    expect(button("Play", 2)).toBeEnabled();
    expect(button("Pause", 2)).toBeDisabled();
    expect(button("Stop", 2)).toBeEnabled(); // paused away from the start

    await user.click(button("Play", 2));
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(clip(2).currentTime).toBe(3);
  });

  it("stops and returns to the start", async () => {
    const user = userEvent.setup();
    render(<SceneRow scene={withClip(2)} {...props} />);
    await user.click(button("Play", 2));
    clip(2).currentTime = 4;
    fireEvent.timeUpdate(clip(2));

    await user.click(button("Stop", 2));

    expect(pauseSpy).toHaveBeenCalled();
    expect(clip(2).currentTime).toBe(0);
    expect(button("Play", 2)).toBeEnabled();
    expect(button("Pause", 2)).toBeDisabled();
    expect(button("Stop", 2)).toBeDisabled();
  });

  it("is ready to play again when the clip ends", async () => {
    render(<SceneRow scene={withClip(2)} {...props} />);
    await userEvent.setup().click(button("Play", 2));

    fireEvent.ended(clip(2));

    expect(button("Play", 2)).toBeEnabled();
    expect(button("Pause", 2)).toBeDisabled();
  });

  it("works from the keyboard", async () => {
    const user = userEvent.setup();
    render(<SceneRow scene={withClip(2)} {...props} />);
    button("Play", 2).focus();

    await user.keyboard("{Enter}");

    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Only one scene clip plays at a time (JOS-281)", () => {
  it("pauses the playing clip, keeping its position, when another one starts", async () => {
    const user = userEvent.setup();
    render(<SceneList {...props} scenes={[withClip(1), withClip(2)]} />);
    await user.click(button("Play", 1));
    const first = clip(1);
    const pauseFirst = vi.spyOn(first, "pause");

    await user.click(button("Play", 2));

    expect(pauseFirst).toHaveBeenCalledTimes(1);
    expect(button("Play", 1)).toBeEnabled();
    expect(button("Pause", 2)).toBeEnabled();
  });
});

describe("A clip that cannot be played (JOS-281)", () => {
  it("says so when the player reports an error, and Play stays available", async () => {
    render(<SceneRow scene={withClip(2)} {...props} />);

    fireEvent.error(clip(2));

    expect(screen.getByRole("status")).toHaveTextContent("Scene 2 clip could not be played.");
    expect(button("Play", 2)).toBeEnabled();
  });

  it("says so when the browser refuses to play, but not when a pause interrupts the start", async () => {
    const user = userEvent.setup();
    render(<SceneRow scene={withClip(2)} {...props} />);

    playResult = () => Promise.reject(new DOMException("interrupted", "AbortError"));
    await user.click(button("Play", 2));
    await settle();
    expect(screen.queryByText("Scene 2 clip could not be played.")).not.toBeInTheDocument();

    playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    await user.click(button("Play", 2));
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent("Scene 2 clip could not be played.");
  });
});

describe("A rebuilt scene (JOS-281)", () => {
  it("loads the new clip from the start, not playing", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SceneRow scene={withClip(2)} {...props} />);
    await user.click(button("Play", 2));
    clip(2).currentTime = 3;
    fireEvent.timeUpdate(clip(2));
    await user.click(button("Pause", 2));

    rerender(<SceneRow scene={withClip(2, { result: { imageUrl: `${imageUrl(2)}?r=1`, videoUrl: `${clipUrl(2)}?r=1` } })} {...props} />);

    expect(clip(2)).toHaveAttribute("src", `${API_BASE}${clipUrl(2)}?r=1`);
    expect(button("Play", 2)).toBeEnabled();
    expect(button("Pause", 2)).toBeDisabled();
    expect(button("Stop", 2)).toBeDisabled();
  });
});

describe("Two quick Plays (JOS-281)", () => {
  it("pauses the first clip even if it has not started playing yet", async () => {
    const user = userEvent.setup();
    render(<SceneList {...props} scenes={[withClip(1), withClip(2)]} />);
    playResult = () => new Promise(() => {}); // still loading
    await user.click(button("Play", 1));
    const pauseFirst = vi.spyOn(clip(1), "pause");

    await user.click(button("Play", 2));

    expect(pauseFirst).toHaveBeenCalledTimes(1);
  });
});
