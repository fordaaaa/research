// @vitest-environment jsdom
// Round 20 items 5 (breadcrumb hidden on mobile) + 7 (single tablist mounted
// per viewport), App-level.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

const NOTEBOOK = { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function mockMatchMedia(matches: { lg: boolean; xl: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1280") ? matches.xl : matches.lg,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

async function bootToWorkspace() {
  window.localStorage.setItem("research_token", "r20-token");
  window.localStorage.setItem("notaeo:onboarding:r20-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r20-user", email: "r20@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockResolvedValue({ add_source: false, search: false, export: false, review: false });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /paste text instead/i });
}

it("item 5: breadcrumb trail is hidden below sm", async () => {
  mockMatchMedia({ lg: false, xl: false });
  await bootToWorkspace();
  const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(breadcrumb.className).toMatch(/hidden/);
  expect(breadcrumb.className).toMatch(/sm:flex/);
});

it("item 7: only one tablist mounted per viewport (mobile)", async () => {
  mockMatchMedia({ lg: false, xl: false });
  await bootToWorkspace();
  // Mobile: only the library tablist. Section tablists for other sections
  // are absent until their section is selected.
  expect(screen.getByRole("tablist", { name: "Library" })).toBeTruthy();
  expect(screen.queryByRole("tablist", { name: "Workspace sections" })).toBeNull();
  // Switch to a non-library section: exactly one section tablist appears.
  const bottomNav = screen.getByRole("navigation", { name: "Notebook sections" });
  fireEvent.click(within(bottomNav).getByRole("button", { name: "Search" }));
  const tablists = screen.getAllByRole("tablist");
  expect(tablists).toHaveLength(1);
  expect(tablists[0].getAttribute("aria-label")).toBe("Current section views");
});

it("item 7: only one tablist mounted per viewport (lg desktop)", async () => {
  mockMatchMedia({ lg: true, xl: false });
  await bootToWorkspace();
  expect(screen.queryByRole("tablist", { name: "Library" })).toBeNull();
  expect(screen.queryByRole("tablist", { name: "Current section views" })).toBeNull();
  expect(screen.getByRole("tablist", { name: "Workspace sections" })).toBeTruthy();
});
