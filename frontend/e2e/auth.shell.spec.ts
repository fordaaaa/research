import { expect, test } from "@playwright/test";
import { silenceTestAudio } from "./audio.js";

// Safe checks that need no account and mutate nothing: the public
// landing/auth shell renders on small touch viewports.
test("login shell renders on mobile viewports", async ({ page }) => {
  await silenceTestAudio(page);
  await page.goto("/");
  expect(await page.evaluate(() => typeof window.AudioContext)).toBe("undefined");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Email address")).toBeVisible();
  await page.getByRole("tab", { name: "Log in", exact: true }).click();
  await expect(page.getByPlaceholder("Password", { exact: true })).toBeVisible();
  const loginButton = page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true });
  await expect(loginButton).toBeDisabled();

  // Switching tabs is UI-only and creates nothing server-side.
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await expect(
    page.getByPlaceholder(/Password \(8\+ characters\)/),
  ).toBeVisible();
});
