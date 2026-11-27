import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNarrationTake, discardNarrationTake, keepNarrationTake, narrationTakeHandlersFor, quoteNarrationTake } from "../src/api/client";
import { NarrationTakePanel, type NarrationTakeHandlers } from "../src/components/NarrationTakePanel";
import { SceneList } from "../src/components/SceneList";
import { narrationTakeRefusalSentence } from "../src/narrationTakeRefusals";
import type { NarrationView, SceneEventPayload, TakeQuote } from "../src/types";

// redo-scene-narration (JOS-282), tasks 5.1 to 5.3 — spec "The page offers Redo narration and the take review", design Decision 13.

function scene(index: number, overrides: Partial<SceneEventPayload> = {}): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: `scene-${index}`,
    index,
    state: "chunk-complete",
    stages: {},
    instruction: "",
    prompt: `Scene ${index}.`,
    narrationRedoable: true,
    updatedAt: "2026-11-26T00:00:00.000Z",
    ...overrides,
  };
}

const QUOTE: TakeQuote = { text: "Scene 1. Scene 2.", characters: 17, estimatedCost: { amount: 0.0017, currency: "USD" }, pauseEditsReset: [2], limit: 2500 };

function handlers(overrides: Partial<NarrationTakeHandlers> = {}): NarrationTakeHandlers {
  return {
    quote: vi.fn(async () => QUOTE),
    create: vi.fn(async () => ({ ok: true, takeId: "take-1" })),
    keep: vi.fn(async () => ({ ok: true })),
    discard: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function renderList(options: { scenes?: SceneEventPayload[]; narration?: NarrationView; sessionState?: "final-video" | "final-video-generating"; takes?: NarrationTakeHandlers } = {}) {
  const takes = options.takes ?? handlers();
  render(
    <SceneList
      scenes={options.scenes ?? [scene(1), scene(2), scene(3)]}
      onRetry={async () => {}}
      onCorrect={async () => {}}
      sessionState={options.sessionState ?? "final-video"}
      narration={options.narration ?? { version: 1 }}
      narrationTakes={takes}
    />,
  );
  return takes;
}

async function openDetails(index: number) {
  await userEvent.setup().click(screen.getByRole("button", { name: `View scene ${index} details` }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the API client (task 5.1)", () => {
  it("asks for a quote with the scene range, and creates, keeps and discards takes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, takeId: "t1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await quoteNarrationTake("s1", "scene-1", "scene-2");
    await createNarrationTake("s1", "scene-1", "scene-2");
    await keepNarrationTake("s1", "t1");
    await discardNarrationTake("s1", "t1");

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    expect(calls[0]![0]).toMatch(/\/sessions\/s1\/narration-takes\/quote\?firstSceneId=scene-1&lastSceneId=scene-2$/);
    expect(calls[1]![0]).toMatch(/\/sessions\/s1\/narration-takes$/);
    expect(calls[1]![1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({ firstSceneId: "scene-1", lastSceneId: "scene-2" });
    expect(calls[2]![0]).toMatch(/\/sessions\/s1\/narration-takes\/t1\/keep$/);
    expect(calls[3]![0]).toMatch(/\/sessions\/s1\/narration-takes\/t1\/discard$/);
  });

  it("binds the four commands to one session for the page", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bound = narrationTakeHandlersFor("s9");
    await bound.quote("a", "b");
    await bound.create("a", "b");
    await bound.keep("t");
    await bound.discard("t");
    expect((fetchMock.mock.calls as unknown as Array<[string]>).map(([url]) => url.replace(/^.*\/sessions\//, ""))).toEqual([
      "s9/narration-takes/quote?firstSceneId=a&lastSceneId=b",
      "s9/narration-takes",
      "s9/narration-takes/t/keep",
      "s9/narration-takes/t/discard",
    ]);
  });

  it("rejects with the refusal reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, reason: "take-in-progress" }), { status: 409 })));
    await expect(createNarrationTake("s1", "a", "b")).rejects.toThrow("take-in-progress");
  });

  it("has a sentence for every refusal", () => {
    for (const reason of ["unknown-scene", "invalid-range", "too-long", "narration-not-located", "take-in-progress", "assembly-in-progress", "unknown-take", "take-not-open", "take-not-ready"]) {
      expect(narrationTakeRefusalSentence(reason)).not.toMatch(/-/);
    }
  });
});

describe("Redo narration on a scene (task 5.2)", () => {
  it("is offered on a scene whose narration can be redone, while no take is open and the session is not assembling", async () => {
    renderList();
    await openDetails(1);
    expect(screen.getByRole("button", { name: "Redo scene 1 narration" })).toBeInTheDocument();
  });

  const notOffered: Array<[string, Parameters<typeof renderList>[0]]> = [
    ["a take is generating", { narration: { version: 1, take: { takeId: "t", state: "generating", firstSceneIndex: 1, lastSceneIndex: 1 } } }],
    ["a take waits for review", { narration: { version: 1, take: { takeId: "t", state: "ready", firstSceneIndex: 1, lastSceneIndex: 1, previewUrl: "/p" } } }],
    ["the session is assembling", { sessionState: "final-video-generating" }],
    ["the scene cannot be redone", { scenes: [scene(1, { narrationRedoable: undefined }), scene(2)] }],
  ];
  it.each(notOffered)("is not offered while %s", async (_label, options) => {
    renderList(options);
    await openDetails(1);
    expect(screen.queryByRole("button", { name: "Redo scene 1 narration" })).not.toBeInTheDocument();
  });

  it("is offered after a failed take", async () => {
    renderList({ narration: { version: 1, take: { takeId: "t", state: "failed", firstSceneIndex: 1, lastSceneIndex: 1, failure: "No." } } });
    await openDetails(1);
    expect(screen.getByRole("button", { name: "Redo scene 1 narration" })).toBeInTheDocument();
  });

  it("chooses the last scene from this scene on, and shows the quote for each choice", async () => {
    const takes = renderList();
    const user = userEvent.setup();
    await openDetails(2);
    await user.click(screen.getByRole("button", { name: "Redo scene 2 narration" }));

    const form = screen.getByRole("form", { name: "Redo scene 2 narration" });
    const through = within(form).getByRole("combobox", { name: "Through scene" });
    expect(within(through).getAllByRole("option").map((option) => option.textContent)).toEqual(["Scene 2", "Scene 3"]);
    expect(takes.quote).toHaveBeenLastCalledWith("scene-2", "scene-2");

    await user.selectOptions(through, "scene-3");
    expect(takes.quote).toHaveBeenLastCalledWith("scene-2", "scene-3");
    expect(await within(form).findByText("Scene 1. Scene 2.")).toBeInTheDocument();
    expect(within(form).getByText("17 characters")).toBeInTheDocument();
    expect(within(form).getByText("Estimated cost: 0.0017 USD")).toBeInTheDocument();
    expect(within(form).getByText("The pause you set on scene 2 will be reset.")).toBeInTheDocument();
    expect(within(form).getByText(/The voice provider reads this text again, and the reading is billed\./)).toBeInTheDocument();
    expect(within(form).getByText(/You can listen to it before you keep it\. When you have checked the scenes, rebuild the final video\./)).toBeInTheDocument();
  });

  it("says when the price is not set", async () => {
    renderList({ takes: handlers({ quote: vi.fn(async () => ({ ...QUOTE, estimatedCost: null, pauseEditsReset: [] })) }) });
    const user = userEvent.setup();
    await openDetails(1);
    await user.click(screen.getByRole("button", { name: "Redo scene 1 narration" }));
    expect(await screen.findByText("The price of the voice provider is not set.")).toBeInTheDocument();
  });

  it("stops the choices at the first scene that cannot be redone", async () => {
    renderList({ scenes: [scene(1), scene(2, { narrationRedoable: undefined }), scene(3)] });
    const user = userEvent.setup();
    await openDetails(1);
    await user.click(screen.getByRole("button", { name: "Redo scene 1 narration" }));
    expect(within(screen.getByRole("combobox", { name: "Through scene" })).getAllByRole("option")).toHaveLength(1);
  });

  it("creates the take on confirm, and closes on cancel, with the keyboard", async () => {
    const takes = renderList();
    const user = userEvent.setup();
    await openDetails(1);
    screen.getByRole("button", { name: "Redo scene 1 narration" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByText("Scene 1. Scene 2.");
    await user.click(screen.getByRole("button", { name: "Read scene 1 again" }));
    expect(takes.create).toHaveBeenCalledWith("scene-1", "scene-1");
    expect(screen.queryByRole("form", { name: "Redo scene 1 narration" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Redo scene 1 narration" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Redo scene 1 narration" })).not.toBeInTheDocument();
  });

  it("shows a refusal as a sentence", async () => {
    renderList({ takes: handlers({ quote: vi.fn(async () => Promise.reject(new Error("too-long"))) }) });
    const user = userEvent.setup();
    await openDetails(1);
    await user.click(screen.getByRole("button", { name: "Redo scene 1 narration" }));
    expect(await screen.findByRole("status")).toHaveTextContent(narrationTakeRefusalSentence("too-long"));
  });

  it("marks a redone scene on its card", () => {
    renderList({ scenes: [scene(1, { narrationRedone: true }), scene(2)] });
    expect(within(screen.getByRole("listitem", { name: "Scene 1" })).getByText("Narration redone")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Scene 2" })).queryByText("Narration redone")).not.toBeInTheDocument();
  });
});

describe("NarrationTakePanel (task 5.3)", () => {
  it("is hidden when there is no open take", () => {
    const { container } = render(<NarrationTakePanel narration={{ version: 2 }} handlers={handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says which scenes are being read again", () => {
    render(<NarrationTakePanel narration={{ version: 1, take: { takeId: "t", state: "generating", firstSceneIndex: 1, lastSceneIndex: 2 } }} handlers={handlers()} />);
    expect(screen.getByRole("region", { name: "New narration" })).toHaveTextContent("Scenes 1 to 2 are being read again.");
  });

  it("offers the preview, Keep new narration and Discard while it waits for review", async () => {
    const takes = handlers();
    render(<NarrationTakePanel narration={{ version: 1, take: { takeId: "t1", state: "ready", firstSceneIndex: 1, lastSceneIndex: 1, previewUrl: "/sessions/s1/narration-takes/t1/preview" } }} handlers={takes} />);
    const player = screen.getByLabelText("New narration of scene 1");
    expect(player.tagName).toBe("AUDIO");
    expect(player).toHaveAttribute("preload", "none");
    expect(player).toHaveAttribute("controls");
    expect(player.getAttribute("src")).toMatch(/\/sessions\/s1\/narration-takes\/t1\/preview$/);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Keep new narration" }));
    expect(takes.keep).toHaveBeenCalledWith("t1");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(takes.discard).toHaveBeenCalledWith("t1");
  });

  it("shows a failed take's cause, and dismisses it", async () => {
    const takes = handlers();
    render(<NarrationTakePanel narration={{ version: 1, take: { takeId: "t1", state: "failed", firstSceneIndex: 3, lastSceneIndex: 3, failure: "Scene 3's new reading is too long." } }} handlers={takes} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Scene 3's new reading is too long.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(takes.discard).toHaveBeenCalledWith("t1");
  });

  it("follows live updates and shows a refusal as a sentence", async () => {
    const takes = handlers({ keep: vi.fn(async () => Promise.reject(new Error("assembly-in-progress"))) });
    const generating: NarrationView = { version: 1, take: { takeId: "t1", state: "generating", firstSceneIndex: 1, lastSceneIndex: 1 } };
    const { rerender } = render(<NarrationTakePanel narration={generating} handlers={takes} />);
    expect(screen.queryByRole("button", { name: "Keep new narration" })).not.toBeInTheDocument();
    act(() => rerender(<NarrationTakePanel narration={{ version: 1, take: { ...generating.take!, state: "ready", previewUrl: "/p" } }} handlers={takes} />));
    await userEvent.setup().click(screen.getByRole("button", { name: "Keep new narration" }));
    expect(await screen.findByRole("status")).toHaveTextContent(narrationTakeRefusalSentence("assembly-in-progress"));
  });
});
