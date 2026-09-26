// @vitest-environment jsdom
// Round 18 item 3: the post-create focus target (the add-sources card) must
// be named so screen-reader users hear where they landed.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

vi.mock("./sound", () => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("names the add-sources card so the post-create focus target is announced", async () => {
  window.localStorage.setItem("research_token", "r18i3-token");
  window.localStorage.setItem("notaeo:onboarding:r18i3-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r18i3-user", email: "r18i3@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /export notebook/i });
  const card = document.querySelector('[data-tour="add-sources"]');
  expect(card, "add-sources card missing").toBeTruthy();
  // Named region: SR users hear "Add sources" when focus lands here.
  expect(card!.getAttribute("aria-label")).toMatch(/add sources/i);
  expect(card!.getAttribute("role")).toBe("region");
});
