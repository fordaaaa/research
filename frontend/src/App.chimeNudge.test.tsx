// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  downloadNotebook: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

const soundMocks = vi.hoisted(() => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => false),
}));

vi.mock("./sound", () => soundMocks);

import App from "./App";

const NOTEBOOK = { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" };
const SOURCE = {
  id: "s1",
  notebook_id: "book",
  kind: "txt",
  title: "Notes",
  tags: [],
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 1,
};

async function openWorkspace(sources: unknown[]) {
  window.localStorage.setItem("research_token", "nudge10-token");
  apiMocks.me.mockResolvedValue({ id: "nudge10-user", email: "nudge10@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue(sources);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  return screen.findByRole("button", { name: /export notebook/i });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("zero-source state shows no chime nudge", async () => {
  await openWorkspace([]);
  expect(screen.queryByRole("button", { name: /turn on chimes/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /preview chime/i })).toBeNull();
});

it("post-export state shows the chime nudge", async () => {
  const exportButton = await openWorkspace([SOURCE]);
  fireEvent.click(exportButton);
  expect(await screen.findByRole("button", { name: /turn on chimes/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /preview chime/i })).toBeTruthy();
});

it("no chime nudge in a zero-source notebook after exporting elsewhere", async () => {
  // Round 25 item 6: "All notebooks" lives in the desktop rail — stub xl.
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      onchange: null,
    }),
  );
  const EMPTY = { id: "empty", name: "Empty", created_at: "2026-01-01T00:00:00Z" };
  window.localStorage.setItem("research_token", "nudge10-token");
  apiMocks.me.mockResolvedValue({ id: "nudge10-user", email: "nudge10@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK, EMPTY]);
  apiMocks.listSources.mockImplementation((id: string) => Promise.resolve(id === "book" ? [SOURCE] : []));
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  fireEvent.click(await screen.findByRole("button", { name: /export notebook/i }));
  await screen.findByRole("button", { name: /turn on chimes/i });
  // Move to a notebook with zero sources: the nudge must not follow.
  fireEvent.click(screen.getByRole("button", { name: /all notebooks/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Open Empty" }));
  await screen.findByRole("button", { name: /export notebook/i });
  expect(screen.queryByRole("button", { name: /turn on chimes/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /preview chime/i })).toBeNull();
});
