import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneRow } from "../src/components/SceneRow";
import { rebuildScene } from "../src/api/client";
import type { SceneEventPayload } from "../src/types";

// rebuild-scene-clip-only, spec scene-rebuild "The page offers a clip-only rebuild" — design Decision 5.

function makeScene(overrides: Partial<SceneEventPayload> = {}): SceneEventPayload {
  return {
    type: "scene",
    sessionId: "s1",
    sceneId: "scene-4",
    index: 4,
    state: "chunk-complete",
    stages: {},
    instruction: "",
    imageInstruction: "A lighthouse at dusk",
    videoInstruction: "Slow pan across the sea",
    result: { imageUrl: "/sessions/s1/scenes/scene-4/image", videoUrl: "/sessions/s1/scenes/scene-4/clip" },
    updatedAt: "2026-11-27T00:00:00.000Z",
    ...overrides,
  };
}

const noop = async () => {};

async function openForm(scene: SceneEventPayload, onRebuild: (sceneId: string, request: object) => Promise<unknown> = noop) {
  const user = userEvent.setup();
  render(<SceneRow scene={scene} onRetry={noop} onCorrect={noop} onRebuild={onRebuild} />);
  await user.click(screen.getByRole("button", { name: "View scene 4 details" }));
  await user.click(screen.getByRole("button", { name: "Rebuild scene 4" }));
  return { user, form: screen.getByRole("form", { name: "Rebuild scene 4" }) };
}

const choice = (form: HTMLElement, name: string) => within(within(form).getByRole("group", { name: "What to rebuild for scene 4" })).getByRole("radio", { name });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the choice of what to rebuild", () => {
  it("is shown for a complete scene with a clip, with Image and clip checked", async () => {
    const { form } = await openForm(makeScene());

    expect(choice(form, "Image and clip")).toBeChecked();
    expect(choice(form, "Clip only, keep the current image")).not.toBeChecked();
    expect(within(form).getByLabelText("IMAGE instruction for scene 4")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Rebuild image and clip" })).toBeInTheDocument();
  });

  it.each([
    ["an image-complete scene", makeScene({ state: "image-complete", result: { imageUrl: "/sessions/s1/scenes/scene-4/image" } })],
    ["a complete scene with no clip", makeScene({ result: { imageUrl: "/sessions/s1/scenes/scene-4/image" } })],
  ])("is not shown for %s", async (_label, scene) => {
    const { form } = await openForm(scene);

    expect(within(form).queryByRole("group", { name: "What to rebuild for scene 4" })).not.toBeInTheDocument();
    expect(within(form).getByLabelText("IMAGE instruction for scene 4")).toBeInTheDocument();
  });
});

describe("Clip only", () => {
  it("hides the IMAGE field and says that only the clip is generated again", async () => {
    const { user, form } = await openForm(makeScene());

    await user.click(choice(form, "Clip only, keep the current image"));

    expect(within(form).queryByLabelText("IMAGE instruction for scene 4")).not.toBeInTheDocument();
    expect(within(form).getByLabelText("VIDEO instruction for scene 4")).toHaveValue("Slow pan across the sea");
    expect(within(form).getByText(/Only the clip is generated again from the current image by the video provider, which costs one request\./)).toBeInTheDocument();
    expect(within(form).getByText(/When you have checked the scenes, rebuild the final video\./)).toBeInTheDocument();
    expect(within(form).queryByText(/image and the clip are generated again/i)).not.toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Rebuild clip" })).toBeInTheDocument();
  });

  it("sends the clip scope with only a changed VIDEO instruction", async () => {
    const onRebuild = vi.fn(async () => {});
    const { user, form } = await openForm(makeScene(), onRebuild);
    await user.click(choice(form, "Clip only, keep the current image"));

    const video = within(form).getByLabelText("VIDEO instruction for scene 4");
    await user.clear(video);
    await user.type(video, "Slow pan, no camera shake");
    await user.click(within(form).getByRole("button", { name: "Rebuild clip" }));

    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", { scope: "clip", videoInstruction: "Slow pan, no camera shake" });
  });

  it("sends the clip scope alone when nothing was changed", async () => {
    const onRebuild = vi.fn(async () => {});
    const { user, form } = await openForm(makeScene(), onRebuild);
    await user.click(choice(form, "Clip only, keep the current image"));

    await user.click(within(form).getByRole("button", { name: "Rebuild clip" }));

    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", { scope: "clip" });
  });

  it("does not send an IMAGE edit, and shows it again when the User switches back", async () => {
    const onRebuild = vi.fn(async () => {});
    const { user, form } = await openForm(makeScene(), onRebuild);
    const image = within(form).getByLabelText("IMAGE instruction for scene 4");
    await user.clear(image);
    await user.type(image, "A red lighthouse");

    await user.click(choice(form, "Clip only, keep the current image"));
    await user.click(choice(form, "Image and clip"));
    expect(within(form).getByLabelText("IMAGE instruction for scene 4")).toHaveValue("A red lighthouse");

    await user.click(choice(form, "Clip only, keep the current image"));
    await user.click(within(form).getByRole("button", { name: "Rebuild clip" }));
    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", { scope: "clip" });
  });

  it("is not blocked by an emptied IMAGE field it does not send", async () => {
    const onRebuild = vi.fn(async () => {});
    const { user, form } = await openForm(makeScene(), onRebuild);
    await user.clear(within(form).getByLabelText("IMAGE instruction for scene 4"));

    await user.click(choice(form, "Clip only, keep the current image"));

    expect(within(form).getByRole("button", { name: "Rebuild clip" })).toBeEnabled();
  });

  it("shows a refusal as a sentence", async () => {
    const onRebuild = vi.fn(async () => {
      throw new Error("scene-not-ready");
    });
    const { user, form } = await openForm(makeScene(), onRebuild);
    await user.click(choice(form, "Clip only, keep the current image"));

    await user.click(within(form).getByRole("button", { name: "Rebuild clip" }));

    expect(await screen.findByText("This scene is being generated right now. Try again when it finishes.")).toBeInTheDocument();
  });
});

describe("Image and clip", () => {
  it("sends no scope, as before", async () => {
    const onRebuild = vi.fn(async () => {});
    const { user, form } = await openForm(makeScene(), onRebuild);

    await user.click(within(form).getByRole("button", { name: "Rebuild image and clip" }));

    expect(onRebuild).toHaveBeenCalledExactlyOnceWith("scene-4", {});
  });
});

describe("rebuildScene in the API client", () => {
  it("sends the clip scope in the body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, held: false }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await rebuildScene("s1", "scene-4", { scope: "clip" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ scope: "clip" });
  });
});
