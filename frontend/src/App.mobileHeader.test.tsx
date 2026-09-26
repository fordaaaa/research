// @vitest-environment jsdom
// Round 14 item 1: 390px header — email TEXT hidden below sm, avatar intact,
// tighter mobile gaps, 44px targets + names kept.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("hides email text on mobile but keeps avatar accessible name", async () => {
  window.localStorage.setItem("research_token", "r14i1-token");
  window.localStorage.setItem("notaeo:onboarding:r14i1-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r14i1-user", email: "mobile390@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const avatar = await screen.findByRole("button", { name: /mobile390@example\.test/i });
  expect(avatar.textContent).toMatch(/mobile390@example\.test/);
  // Any VISIBLE email text must be hidden below sm.
  const header = avatar.closest("header")!;
  const emailText = header.querySelector("[data-testid='header-email-text']");
  expect(emailText).toBeTruthy();
  expect(emailText!.className).toMatch(/hidden/);
  expect(emailText!.className).toMatch(/sm:inline/);
  // Avatar keeps aria-label + sr-only email.
  expect(avatar.getAttribute("aria-label")).toMatch(/mobile390@example\.test/);
});

it("keeps tight mobile gaps and 44px targets with names", async () => {
  window.localStorage.setItem("research_token", "r14i1-token");
  window.localStorage.setItem("notaeo:onboarding:r14i1-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r14i1-user", email: "mobile390@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const settings = await screen.findByRole("button", { name: "Settings" });
  const header = settings.closest("header")!;
  expect(header.className).toMatch(/gap-1\.5/);
  expect(header.className).toMatch(/sm:gap-3/);
  const actions = header.querySelector("[data-testid='header-actions']")!;
  expect(actions.className).toMatch(/gap-1/);
  expect(settings.className).toMatch(/min-h-11/);
  expect(screen.getByRole("button", { name: "Take a tour" }).className).toMatch(/min-h-11/);
});
