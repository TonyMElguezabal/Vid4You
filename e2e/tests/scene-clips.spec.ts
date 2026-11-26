import { expect, test, type Page } from "@playwright/test";

// watch-scene-clips (JOS-281) — a scene's clip plays on its card as soon as it is stored, with Play, Pause and Stop, and
// nothing is downloaded before Play. Real playback, on the stubbed backend (playwright.config.ts). The stub voice always
// gives 1 s of audio, so a stubbed session has one scene: "one clip at a time" is covered by the component tests.

const SCRIPT = "The harbor wakes before the sun, and the first boats slide out past the stone wall.";

async function startSession(page: Page): Promise<void> {
  await page.goto("/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }
  const form = page.getByRole("form", { name: "Start a project" });
  await form.getByLabel("Title").fill("Clip player E2E");
  await form.getByLabel("Script").fill(SCRIPT);
  await form.getByLabel("Language").selectOption("en");
  await expect(form.getByLabel("Title")).toHaveValue("Clip player E2E");
  await expect(form.getByLabel("Script")).toHaveValue(SCRIPT);
  await form.getByRole("button", { name: "Start project" }).click();
}

const clip = (page: Page) => page.getByLabel("Scene 1 clip", { exact: true });
const currentTime = (page: Page) => clip(page).evaluate((video: HTMLVideoElement) => video.currentTime);
const isPaused = (page: Page) => clip(page).evaluate((video: HTMLVideoElement) => video.paused);

test("a stored clip plays on its scene card with Play, Pause and Stop", async ({ page }) => {
  const clipRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/scenes\/[^/]+\/clip/.test(request.url())) clipRequests.push(request.url());
  });
  await startSession(page);

  const play = page.getByRole("button", { name: "Play scene 1 clip" });
  const pause = page.getByRole("button", { name: "Pause scene 1 clip" });
  const stop = page.getByRole("button", { name: "Stop scene 1 clip" });
  await expect(play).toBeVisible({ timeout: 60_000 });
  // On the collapsed card, and nothing downloaded before Play.
  await expect(page.getByRole("button", { name: "View scene 1 details" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Scene 1 clip", { exact: true })).toHaveAttribute("preload", "none");
  expect(clipRequests).toEqual([]);

  // Play, then Pause keeps the position.
  await play.click();
  await expect(pause).toBeEnabled();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
  expect(clipRequests.length).toBeGreaterThan(0);
  await pause.click();
  await expect(play).toBeEnabled();
  const pausedAt = await currentTime(page);
  expect(pausedAt).toBeGreaterThan(0);
  expect(await isPaused(page)).toBe(true);
  await page.waitForTimeout(500);
  expect(await currentTime(page)).toBe(pausedAt);

  // Play resumes from there; Stop returns to the start.
  await play.click();
  await expect(pause).toBeEnabled();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(pausedAt);
  await stop.click();
  await expect(play).toBeEnabled();
  await expect(stop).toBeDisabled();
  expect(await currentTime(page)).toBe(0);
  expect(await isPaused(page)).toBe(true);
  await expect(page.getByText("Scene 1 clip could not be played.")).toHaveCount(0);
});
