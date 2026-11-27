import { expect, test, type Page } from "@playwright/test";

// redo-scene-narration (JOS-282) — a scene's narration is read again, listened to with real playback, then kept or
// discarded. Keeping never rebuilds the final video by itself (design Decision 15): the User checks the scenes and clicks
// "Rebuild final video", which is not offered while a take is open. On the stubbed backend (playwright.config.ts): the stub voice gives 1 s of
// audio, so the session has one scene and a range of several scenes is covered by the component tests.

const SCRIPT = "The harbor wakes before the sun, and the first boats slide out past the stone wall.";

async function startSession(page: Page): Promise<void> {
  await page.goto("/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }
  const form = page.getByRole("form", { name: "Start a project" });
  await form.getByLabel("Title").fill("Narration redo E2E");
  await form.getByLabel("Script").fill(SCRIPT);
  await form.getByLabel("Language").selectOption("en");
  await expect(form.getByLabel("Title")).toHaveValue("Narration redo E2E");
  await expect(form.getByLabel("Script")).toHaveValue(SCRIPT);
  await form.getByRole("button", { name: "Start project" }).click();
}

async function requestTake(page: Page): Promise<void> {
  const redo = page.getByRole("button", { name: "Redo scene 1 narration" });
  if (!(await redo.isVisible())) await page.getByRole("button", { name: "View scene 1 details" }).click();
  await redo.click();
  const form = page.getByRole("form", { name: "Redo scene 1 narration" });
  await expect(form.getByText(SCRIPT)).toBeVisible();
  await expect(form.getByText(`${SCRIPT.length} characters`)).toBeVisible();
  await expect(form.getByText(/Estimated cost|The price of the voice provider is not set\./)).toBeVisible();
  await form.getByRole("button", { name: "Read scene 1 again" }).click();
}

const review = (page: Page) => page.getByRole("region", { name: "New narration" });
const version = (page: Page) => page.getByText(/^Version \d+$/);
const rebuildButton = (page: Page) => page.getByRole("button", { name: "Rebuild final video" });
const STALE_NOTE = "This version predates your changes. Check every scene, then rebuild the final video.";
const TAKE_OPEN_NOTE = "Keep or discard the new narration before rebuilding the final video.";

test("a scene's narration is redone, played and kept, a second take is discarded, then the User rebuilds the final video", async ({ page }) => {
  await startSession(page);
  await expect(page.getByRole("link", { name: "Download final video" })).toBeVisible({ timeout: 60_000 });
  await expect(version(page)).toHaveText("Version 1");

  await requestTake(page);
  const preview = review(page).getByLabel("New narration of scene 1");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview).toHaveAttribute("preload", "none");
  // Real playback of the preview.
  await preview.evaluate((audio: HTMLAudioElement) => audio.play());
  await expect.poll(() => preview.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.2);
  await preview.evaluate((audio: HTMLAudioElement) => audio.pause());

  await expect(rebuildButton(page)).toHaveCount(0);
  await expect(page.getByText(TAKE_OPEN_NOTE)).toHaveCount(0); // nothing to rebuild yet

  await review(page).getByRole("button", { name: "Keep new narration" }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByText("Narration redone")).toBeVisible();
  // Nothing is rebuilt by itself: version 1 stays, and the User is asked to check the scenes first.
  await expect(page.getByText(STALE_NOTE)).toBeVisible();
  await expect(page.getByText("A new version is being built.", { exact: false })).toHaveCount(0);
  await expect(version(page)).toHaveText("Version 1");

  // A second take while the first is waiting to be rebuilt: no rebuild until it is kept or discarded.
  await requestTake(page);
  await expect(review(page).getByLabel("New narration of scene 1")).toBeVisible({ timeout: 30_000 });
  await expect(rebuildButton(page)).toHaveCount(0);
  await expect(page.getByText(TAKE_OPEN_NOTE)).toBeVisible();
  await review(page).getByRole("button", { name: "Discard" }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(version(page)).toHaveText("Version 1");
  await expect(page.getByText("Narration redone")).toBeVisible();

  // The User rebuilds: version 2 has the kept narration.
  await rebuildButton(page).click();
  await expect(version(page)).toHaveText("Version 2", { timeout: 60_000 });
  await expect(page.getByText(STALE_NOTE)).toHaveCount(0);
  await expect(rebuildButton(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download final video" })).toBeVisible();
});
