import type { Page } from "@playwright/test";

export interface AuthGate {
  isRemote: boolean;
  email?: string;
  password?: string;
  allowRegistration: boolean;
  /** True when the run may create users/notebooks. */
  canWrite: boolean;
  skipReason: string;
}

export function authGate(): AuthGate {
  const isRemote = (process.env.RESEARCH_E2E_BASE_URL ?? "").length > 0;
  const email = process.env.RESEARCH_E2E_EMAIL || undefined;
  const password = process.env.RESEARCH_E2E_PASSWORD || undefined;
  const allowRegistration = process.env.RESEARCH_E2E_ALLOW_REGISTRATION === "1";
  // Local runs use an isolated temp data dir, so self-registration is safe.
  const canWrite =
    Boolean(email && password) || allowRegistration || !isRemote;
  return {
    isRemote,
    email,
    password,
    allowRegistration,
    canWrite,
    skipReason:
      "needs RESEARCH_E2E_EMAIL + RESEARCH_E2E_PASSWORD or RESEARCH_E2E_ALLOW_REGISTRATION=1 for state-mutating flows",
  };
}

export function generatedCredentials(): { email: string; password: string } {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
  return {
    email: `e2e-${stamp}@example.com`,
    password: `e2e-pass-${stamp}-x!`,
  };
}

/** Register a fresh account (local mode) or log in with supplied creds. */
export async function ensureAuth(
  page: Page,
  gate: AuthGate,
): Promise<{ email: string }> {
  const creds =
    gate.email && gate.password
      ? { email: gate.email, password: gate.password }
      : generatedCredentials();

  await page.goto("/");
  const emailField = page.getByPlaceholder("Email address");
  await emailField.fill(creds.email);

  if (gate.email && gate.password) {
    await page.getByPlaceholder("Password").fill(creds.password);
    await page
      .locator("form")
      .getByRole("button", { name: "Log in", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: "Create account" }).first().click();
    await page.getByPlaceholder(/Password \(8\+ characters\)/).fill(creds.password);
    await page
      .locator("form")
      .getByRole("button", { name: "Create account", exact: true })
      .click();
  }

  // Notebook picker proves the session is live.
  await page.getByPlaceholder(/New notebook name/i).waitFor();
  return { email: creds.email };
}

export function uniqueName(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
  return `${prefix}-${stamp}`;
}
