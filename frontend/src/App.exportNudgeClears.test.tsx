// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  addPaste: vi.fn(),
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
  kind: "paste",
  title: "Mitosis Notes",
  tags: [],
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("clears the 'Add a source first' nudge once sources refresh non-empty", async () => {
  window.localStorage.setItem("research_token", "nudge-token");
  apiMocks.me.mockResolvedValue({ id: "nudge-user", email: "nudge@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  fireEvent.click(exportButton);
  expect(await screen.findByText(/add a source first/i)).toBeTruthy();

  // A source arrives: the next sources refresh must clear the stale nudge.
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  apiMocks.addPaste.mockResolvedValue(SOURCE);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));

  await waitFor(() => expect(apiMocks.addPaste).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText(/add a source first/i)).toBeNull());
});
