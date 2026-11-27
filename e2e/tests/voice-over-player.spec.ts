import { expect, test, type Locator, type Page } from "@playwright/test";

// listen-to-voice-over — the Voice-over section plays the stored narration with Play, Pause and Stop, and nothing is
// downloaded before Play. Real playback, on the stubbed backend (playwright.config.ts). The stub voice gives 1 s of
// audio, enough for Play, Stop and the end; pause and resume are covered by the component tests.

const SCRIPT = "The harbor wakes before the sun, and the first boats slide out past the stone wall.";

async function startSession(page: Page): Promise<void> {
  await page.goto("/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }
  const form = page.getByRole("form", { name: "Start a project" });
  await form.getByLabel("Title").fill("Voice-over player E2E");
  await form.getByLabel("Script").fill(SCRIPT);
  await form.getByLabel("Language").selectOption("en");
  await expect(form.getByLabel("Title")).toHaveValue("Voice-over player E2E");
  await expect(form.getByLabel("Script")).toHaveValue(SCRIPT);
  await form.getByRole("button", { name: "Start project" }).click();
}

const media = (locator: Locator) => locator.evaluate((element: HTMLMediaElement) => ({ time: element.currentTime, paused: element.paused, ended: element.ended }));

test("the stored voice-over plays from the Voice-over section with Play, Pause and Stop", async ({ page }) => {
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/narration/audio")) audioRequests.push(request.url());
  });
  await startSession(page);

  const section = page.getByRole("region", { name: "Voice-over phase" });
  const audio = section.getByLabel("Voice-over", { exact: true });
  const play = section.getByRole("button", { name: "Play voice-over" });
  const pause = section.getByRole("button", { name: "Pause voice-over" });
  const stop = section.getByRole("button", { name: "Stop voice-over" });
  await expect(play).toBeVisible({ timeout: 60_000 });
  await expect(audio).toHaveAttribute("preload", "none");
  await expect(pause).toBeDisabled();
  await expect(stop).toBeDisabled();
  expect(audioRequests).toEqual([]);

  // Play, then Stop returns to the start.
  await play.click();
  await expect(pause).toBeEnabled();
  await expect.poll(async () => (await media(audio)).time).toBeGreaterThan(0.1);
  expect(audioRequests.length).toBeGreaterThan(0);
  await stop.click();
  await expect(play).toBeEnabled();
  await expect(stop).toBeDisabled();
  expect(await media(audio)).toMatchObject({ time: 0, paused: true });

  // Played to the end, the player is ready to play again.
  await play.click();
  await expect.poll(async () => (await media(audio)).ended, { timeout: 10_000 }).toBe(true);
  await expect(play).toBeEnabled();
  await expect(pause).toBeDisabled();
  await expect(page.getByText("The voice-over could not be played.")).toHaveCount(0);
});

test("starting the voice-over pauses a playing scene clip", async ({ page }) => {
  await startSession(page);
  const playClip = page.getByRole("button", { name: "Play scene 1 clip" });
  await expect(playClip).toBeVisible({ timeout: 60_000 });
  const clip = page.getByLabel("Scene 1 clip", { exact: true });

  await playClip.click();
  await expect.poll(async () => (await media(clip)).time).toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "Play voice-over" }).click();

  await expect(page.getByRole("button", { name: "Pause voice-over" })).toBeEnabled();
  await expect(playClip).toBeEnabled();
  const clipState = await media(clip);
  expect(clipState.paused).toBe(true);
  expect(clipState.time).toBeGreaterThan(0.2);
});
