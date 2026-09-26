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

import { playSuccess } from "./sound";
import App from "./App";

const NOTEBOOK = { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" };

async function openWorkspace(sources: unknown[]) {
  window.localStorage.setItem("research_token", "export-token");
  apiMocks.me.mockResolvedValue({ id: "export-user", email: "export@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue(sources);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  return screen.findByRole("button", { name: /export notebook/i });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("nudges to add a source first instead of celebrating an empty export", async () => {
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  const exportButton = await openWorkspace([]);

  fireEvent.click(exportButton);

  expect(await screen.findByText(/add a source first/i)).toBeTruthy();
  expect(apiMocks.downloadNotebook).not.toHaveBeenCalled();
  expect(playSuccess).not.toHaveBeenCalled();
  expect(screen.queryByText(/exported/i)).toBeNull();
});

it("still celebrates a non-empty export with pill + chime", async () => {
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  const exportButton = await openWorkspace([
    {
      id: "s1",
      notebook_id: "book",
      kind: "txt",
      title: "Notes",
      tags: [],
      meta: {},
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
    },
  ]);

  fireEvent.click(exportButton);

  await waitFor(() => expect(apiMocks.downloadNotebook).toHaveBeenCalledWith("book"));
  expect(await screen.findByText(/exported ✓/i)).toBeTruthy();
  expect(playSuccess).toHaveBeenCalled();
});
