import { expect, test, type Page } from "@playwright/test";

// rebuild-scene-clip-only — the Rebuild scene form can rebuild only the clip and keep the current image. On the stubbed
// backend (playwright.config.ts), whose session has one scene.

const SCRIPT = "The harbor wakes before the sun, and the first boats slide out past the stone wall.";

async function startSession(page: Page): Promise<void> {
  await page.goto("/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }
  const form = page.getByRole("form", { name: "Start a project" });
  await form.getByLabel("Title").fill("Clip-only rebuild E2E");
  await form.getByLabel("Script").fill(SCRIPT);
  await form.getByLabel("Language").selectOption("en");
  await expect(form.getByLabel("Title")).toHaveValue("Clip-only rebuild E2E");
  await expect(form.getByLabel("Script")).toHaveValue(SCRIPT);
  await form.getByRole("button", { name: "Start project" }).click();
}

test("a scene's clip is rebuilt and its image is kept", async ({ page }) => {
  await startSession(page);
  await expect(page.getByRole("link", { name: /Download final video/ })).toBeVisible({ timeout: 60_000 });

  const card = page.getByRole("listitem", { name: "Scene 1" });
  await card.getByRole("button", { name: "View scene 1 details" }).click();
  const image = card.getByRole("img", { name: "Scene 1 image" });
  const imageBefore = await image.getAttribute("src");
  const clipBefore = await card.getByLabel("Scene 1 clip", { exact: true }).getAttribute("src");
  await card.getByRole("button", { name: "Rebuild scene 1" }).click();

  const form = card.getByRole("form", { name: "Rebuild scene 1" });
  const scope = form.getByRole("group", { name: "What to rebuild for scene 1" });
  await expect(scope.getByRole("radio", { name: "Image and clip" })).toBeChecked();
  await expect(form.getByLabel("IMAGE instruction for scene 1")).toBeVisible();
  await scope.getByText("Clip only, keep the current image").click();
  await expect(form.getByLabel("IMAGE instruction for scene 1")).toHaveCount(0);
  await expect(form.getByText(/Only the clip is generated again from the current image/)).toBeVisible();

  const rebuildRequest = page.waitForRequest((request) => /\/scenes\/[^/]+\/rebuild$/.test(request.url()));
  await form.getByRole("button", { name: "Rebuild clip" }).click();
  expect((await rebuildRequest).postDataJSON()).toEqual({ scope: "clip" });

  // The scene completes again with a new clip, and the image is the same stored file.
  const clip = card.getByLabel("Scene 1 clip", { exact: true });
  await expect(clip).toHaveAttribute("src", /\?r=1$/, { timeout: 30_000 });
  expect(await clip.getAttribute("src")).not.toBe(clipBefore);
  await expect(card.getByText("Done")).toBeVisible();
  const imageAfter = await image.getAttribute("src");
  expect(imageAfter?.replace(/\?r=\d+$/, "")).toBe(imageBefore?.replace(/\?r=\d+$/, ""));

  await expect(page.getByRole("button", { name: "Rebuild final video" })).toBeVisible();
});
