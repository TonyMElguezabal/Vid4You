import { expect, test, type Page } from "@playwright/test";

// final-video-build-progress — while a new version of the final video is built, the Final video section shows a progress
// bar and the download is disabled; at the end the new version can be downloaded. The stubbed assembly reports its
// progress over 2 s (playwright.config.ts). A kept narration take makes the rebuild possible with the one stub scene.

const SCRIPT = "The harbor wakes before the sun, and the first boats slide out past the stone wall.";
const finalVideo = (page: Page) => page.getByRole("region", { name: "Final video phase" });

async function startSession(page: Page): Promise<void> {
  await page.goto("/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await notNow.click();
    await expect(notNow).toBeHidden();
  }
  const form = page.getByRole("form", { name: "Start a project" });
  await expect(async () => {
    await form.getByLabel("Title").fill("Build progress E2E");
    await form.getByLabel("Script").fill(SCRIPT);
    await form.getByLabel("Language").selectOption("en");
    await expect(form.getByLabel("Title")).toHaveValue("Build progress E2E");
    await expect(form.getByLabel("Script")).toHaveValue(SCRIPT);
  }).toPass();
  await form.getByRole("button", { name: "Start project" }).click();
}

async function keepANewNarration(page: Page): Promise<void> {
  const redo = page.getByRole("button", { name: "Redo scene 1 narration" });
  if (!(await redo.isVisible())) await page.getByRole("button", { name: "View scene 1 details" }).click();
  await redo.click();
  await page.getByRole("form", { name: "Redo scene 1 narration" }).getByRole("button", { name: "Read scene 1 again" }).click();
  const review = page.getByRole("region", { name: "New narration" });
  await review.getByRole("button", { name: "Keep new narration" }).click({ timeout: 30_000 });
  await expect(review).toHaveCount(0);
}

test("a rebuild shows its progress and disables the download until the new version is ready", async ({ page }) => {
  await startSession(page);
  const download = finalVideo(page).getByRole("link", { name: "Download final video" });
  await expect(download).toBeVisible({ timeout: 60_000 });
  await expect(finalVideo(page).getByText("Version 1")).toBeVisible();
  await keepANewNarration(page);

  await finalVideo(page).getByRole("button", { name: "Rebuild final video" }).click();

  const bar = finalVideo(page).getByRole("progressbar", { name: "Final video progress" });
  await expect(bar).toBeVisible();
  await expect(finalVideo(page).getByText(/^(Waiting to start|Preparing clips: \d+ of \d+|Encoding the final video)$/)).toBeVisible();
  await expect(finalVideo(page).getByRole("button", { name: "Download final video" })).toBeDisabled();
  await expect(download).toHaveCount(0);
  await expect(finalVideo(page).getByText("The download is available again when the new version is ready.")).toBeVisible();
  await expect(finalVideo(page).getByText("Encoding the final video")).toBeVisible({ timeout: 10_000 });

  await expect(finalVideo(page).getByText("Version 2")).toBeVisible({ timeout: 30_000 });
  await expect(bar).toHaveCount(0);
  await expect(download).toBeEnabled();
  await expect(finalVideo(page).getByText(/available again/)).toHaveCount(0);
});
