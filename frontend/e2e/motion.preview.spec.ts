import { expect, test } from "@playwright/test";
import { silenceTestAudio } from "./audio.js";

// Exercise the UI offline with a fake signed-in shell. Preview never needs
// a provider key or writes to the backend, including in remote test mode.
test.beforeEach(async ({ page }) => {
  await silenceTestAudio(page);
  await page.addInitScript(() => localStorage.setItem("research_token", "motion-preview-token"));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) { await route.continue(); return; }
    const bodies: Record<string, unknown> = {
      "/api/auth/me": { id: "motion-user", email: "motion@example.test" },
      "/api/notebooks": [],
      "/api/settings/ai": { configured: false },
      "/api/ai/hosted/status": { enabled: false },
      "/api/me/progress": {},
    };
    await route.fulfill({ status: path in bodies ? 200 : 503, contentType: "application/json",
      body: JSON.stringify(bodies[path] ?? { detail: "Preview has no backend" }) });
  });
});

test("motion preview supports loading, card flips, and AI outcomes without requests", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Try motion" }).click();
  const preview = settings.getByRole("region", { name: "Motion preview" });
  await expect(preview.getByRole("status")).toContainText("Opening notebook…");
  let previewRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) previewRequests += 1; });
  await preview.getByRole("button", { name: "Flashcards", exact: true }).click();
  const flip = preview.getByRole("button", { name: "Show answer" });
  await flip.focus();
  await page.keyboard.press("Enter");
  await expect(preview.getByRole("button", { name: "Hide answer" })).toBeFocused();
  await expect(preview).toContainText("The cell’s main energy carrier.");
  await expect(preview).not.toContainText("What is ATP?");
  await preview.getByRole("button", { name: "Next sample card" }).click();
  await expect(preview).toContainText("What carries genetic information?");
  await preview.getByRole("button", { name: "AI thinking", exact: true }).click();
  await expect(preview.getByRole("img", { name: "AI is thinking…" })).toBeVisible();
  await preview.getByRole("combobox", { name: "Thinking style" }).selectOption("solving");
  await expect(preview.getByRole("img", { name: "Reasoning…" })).toBeVisible();
  await preview.getByRole("button", { name: "Show sample answer" }).click();
  await expect(preview).toContainText("Mitochondria help cells produce ATP.");
  await preview.getByRole("button", { name: "Replay thinking" }).click();
  await preview.getByRole("button", { name: "Show sample error" }).click();
  await expect(preview.getByRole("alert")).toContainText("Sample error");
  expect(previewRequests).toBe(0);
  await settings.getByRole("button", { name: "Stop preview" }).click();
  await expect(preview).toHaveCount(0);
});

test("reduced motion leaves sample flashcards and answers readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Try motion" }).click();
  const preview = settings.getByRole("region", { name: "Motion preview" });
  const folio = preview.locator(".folio-animated-folio");
  await expect(folio).toHaveCSS("animation-iteration-count", "1");
  await preview.getByRole("button", { name: "Flashcards", exact: true }).click();
  await preview.getByRole("button", { name: "Show answer" }).click();
  await expect(preview).toContainText("The cell’s main energy carrier.");
  await preview.getByRole("button", { name: "AI thinking", exact: true }).click();
  await preview.getByRole("button", { name: "Show sample answer" }).click();
  await expect(preview).toContainText("Mitochondria help cells produce ATP.");
  await expect.poll(async () => preview.locator(".animate-chat-message").evaluate((el) =>
    parseFloat(getComputedStyle(el).animationDuration))).toBeLessThanOrEqual(0.00001);
});
