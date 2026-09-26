// @vitest-environment jsdom
// Round 18 item 5: the appearance live region must live at App level so it
// survives the dialog closing. Changing the theme announces in the
// persistent region, and the region is still mounted after close.
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

it("announces theme changes in a persistent App-level region", async () => {
  window.localStorage.setItem("research_token", "r18i5-token");
  window.localStorage.setItem("notaeo:onboarding:r18i5-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r18i5-user", email: "r18i5@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ocean" }));
  const live = await screen.findByRole("status", { name: "Appearance announcement" });
  expect(live.textContent ?? "").toMatch(/ocean theme on/i);
  // Close the dialog — the App-level region (and its text) must survive.
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(screen.getByRole("status", { name: "Appearance announcement" }).textContent ?? "").toMatch(
    /ocean theme on/i,
  );
});
