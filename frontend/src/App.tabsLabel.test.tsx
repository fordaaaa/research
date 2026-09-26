// @vitest-environment jsdom
// Round 18 item 4: the in-main Tabs must be labelled "Current section views"
// so it no longer collides with the mobile BottomNav ("Notebook sections").
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

it("labels the in-main Tabs distinctly from the BottomNav", async () => {
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
  window.localStorage.setItem("research_token", "r18i4-token");
  window.localStorage.setItem("notaeo:onboarding:r18i4-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r18i4-user", email: "r18i4@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /export notebook/i });

  // BottomNav keeps its label.
  expect(document.querySelector('nav[aria-label="Notebook sections"].fixed')).toBeTruthy();
  // The in-main Tabs only render off the Library section — switch via the
  // BottomNav's Search button.
  const bottomNav = document.querySelector('nav[aria-label="Notebook sections"].fixed');
  const navSearch = Array.from(bottomNav!.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Search",
  );
  expect(navSearch, "BottomNav Search missing").toBeTruthy();
  fireEvent.click(navSearch!);
  // In-main Tabs carry the distinct label.
  expect(screen.getByRole("tablist", { name: "Current section views" })).toBeTruthy();
  expect(screen.queryByRole("tablist", { name: "Notebook sections" })).toBeNull();
});
