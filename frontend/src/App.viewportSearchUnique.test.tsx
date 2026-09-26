// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function mockViewport(width: number) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => {
      const minWidth = query.match(/min-width:\s*(\d+)px/);
      const matches = minWidth ? width >= Number.parseInt(minWidth[1], 10) : false;
      return {
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        onchange: null,
      };
    },
  );
}

async function openWorkspace() {
  window.localStorage.setItem("research_token", "dup-token");
  apiMocks.me.mockResolvedValue({ id: "dup-user", email: "dup@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /export notebook/i });
}

function focusableNavSearches(): Element[] {
  // The mobile bottom nav is a section switcher (Library/Search/Study/…),
  // one level above the view tabs — exclude it so the count covers the
  // workspace view navs only.
  const scopes = 'nav[aria-label="Workspace tools"], nav[aria-label="Notebook sections"]:not(.fixed), [role="tablist"]';
  const candidates = Array.from(document.querySelectorAll(scopes)).flatMap((scope) =>
    Array.from(scope.querySelectorAll('button:not([disabled]), [role="tab"]')).filter(
      (el) => el.textContent?.trim() === "Search",
    ),
  );
  return candidates.filter((el) => {
    if ((el as HTMLElement).tabIndex < 0) return false;
    if ((el as HTMLElement).closest("[inert]")) return false;
    return true;
  });
}

describe("round7 item6 hidden duplicates", () => {
  it("xl viewport: exactly one focusable Search", async () => {
    mockViewport(1400);
    await openWorkspace();
    const xlNav = document.querySelector('nav[aria-label="Workspace tools"]');
    expect(xlNav?.hasAttribute("inert")).toBe(false);
    fireEvent.click(within(xlNav as HTMLElement).getByRole("button", { name: "Search" }));
    expect(focusableNavSearches().length).toBe(1);
  });

  it("mobile viewport: xl nav unmounted, exactly one focusable Search", async () => {
    mockViewport(500);
    await openWorkspace();
    // Round 25 item 6: the off-breakpoint rail unmounts (not inert-hidden).
    const xlNav = document.querySelector('nav[aria-label="Workspace tools"]');
    expect(xlNav).toBeNull();
    const bottomNav = document.querySelector('nav[aria-label="Notebook sections"].fixed');
    expect(bottomNav, "mobile bottom nav missing").toBeTruthy();
    fireEvent.click(within(bottomNav as HTMLElement).getByRole("button", { name: "Search" }));
    const searchTabs = screen.getAllByRole("tab", { name: /^Search( \(.*\))?$/ });
    const activeTab = searchTabs.find((tab) => !tab.closest("[inert]")) ?? searchTabs[0];
    fireEvent.click(activeTab);
    expect(focusableNavSearches().length).toBe(1);
  });
});
