// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  isSoundEnabled: vi.fn(() => true),
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

async function openWorkspaceWithSource() {
  window.localStorage.setItem("research_token", "pill-token");
  apiMocks.me.mockResolvedValue({ id: "pill-user", email: "pill@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  fireEvent.click(exportButton);
  await screen.findByText(/exported ✓/i);
  return exportButton;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("keeps the Exported pill past 3s until the user acts", async () => {
  await openWorkspaceWithSource();
  await new Promise((resolve) => setTimeout(resolve, 3200));
  expect(screen.getByText(/exported ✓/i)).toBeTruthy();
}, 15000);

it("dismisses the Exported pill via its dismiss button", async () => {
  await openWorkspaceWithSource();
  fireEvent.click(screen.getByRole("button", { name: /dismiss export confirmation/i }));
  await waitFor(() => expect(screen.queryByText(/exported ✓/i)).toBeNull());
});

it("clears the Exported pill on notebook switch", async () => {
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
  await openWorkspaceWithSource();
  fireEvent.click(screen.getByRole("button", { name: /all notebooks/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /export notebook/i });
  expect(screen.queryByText(/exported ✓/i)).toBeNull();
});
