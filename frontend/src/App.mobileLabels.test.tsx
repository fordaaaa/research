// @vitest-environment jsdom
// Round 17 item 3: the mobile bottom bar uses the dominant desktop view name
// per section (Library/Search/Study/Humanize/Ask) so "Search" is findable on
// mobile. Values (MobileSection) are unchanged — labels only.
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
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("mobile bottom nav labels match desktop views", async () => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => {
      void query;
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        onchange: null,
      };
    },
  );
  window.localStorage.setItem("research_token", "r17i3-token");
  window.localStorage.setItem("notaeo:onboarding:r17i3-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r17i3-user", email: "r17i3@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /export notebook/i });

  const bottomNav = document.querySelector('nav[aria-label="Notebook sections"].fixed');
  expect(bottomNav, "mobile bottom nav missing").toBeTruthy();
  const labels = Array.from(bottomNav!.querySelectorAll("button")).map((button) =>
    button.textContent?.trim(),
  );
  expect(labels).toEqual(["Library", "Search", "Study", "Humanize", "Ask"]);
});
