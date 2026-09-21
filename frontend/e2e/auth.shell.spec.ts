import { expect, test } from "@playwright/test";

// Safe checks that need no account and mutate nothing: the public
// landing/auth shell renders on small touch viewports.
test("login shell renders on mobile viewports", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "research, locally" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Email address")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  const loginButton = page
    .locator("form")
    .getByRole("button", { name: "Log in", exact: true });
  await expect(loginButton).toBeDisabled();

  // Switching tabs is UI-only and creates nothing server-side.
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(
    page.getByPlaceholder(/Password \(8\+ characters\)/),
  ).toBeVisible();
});
