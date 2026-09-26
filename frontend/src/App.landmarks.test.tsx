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
  window.localStorage.clear();
});

describe("round8 item6 app landmarks", () => {
  it("desktop rail nav is labeled and every tablist carries a name (no visual change)", async () => {
    window.localStorage.setItem("research_token", "lm-token");
    apiMocks.me.mockResolvedValue({ id: "lm-user", email: "lm@example.test" });
    apiMocks.listNotebooks.mockResolvedValue([
      { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
    ]);
    apiMocks.listSources.mockResolvedValue([]);
    apiMocks.getAISettings.mockResolvedValue({ configured: false });
    apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));

    // Round 25 item 6: the off-breakpoint bar unmounts (jsdom has no
    // matchMedia = mobile viewport) — only the bottom bar is mounted, never
    // the desktop rail alongside it.
    expect(screen.queryByRole("navigation", { name: "Workspace tools" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Notebook sections" })).toBeTruthy();
    const tablists = screen.getAllByRole("tablist");
    expect(tablists.length).toBeGreaterThan(0);
    for (const list of tablists) {
      const name = list.getAttribute("aria-label");
      expect(name, "every tablist must have an accessible name").toBeTruthy();
    }
    // Round 20 item 7: tablists mount per-breakpoint (jsdom has no
    // matchMedia, so the mobile Library tablist is the mounted one).
    // Exactly one tablist is mounted per viewport.
    expect(tablists).toHaveLength(1);
    // Mobile bottom nav keeps its labeled landmark.
    expect(screen.getByRole("navigation", { name: "Notebook sections" }).tagName).toBe("NAV");
    void within;
  });
});
