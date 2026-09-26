// @vitest-environment jsdom
// Round 21 item 1 (FAILING first): deleting a notebook announces
// "Notebook X deleted" via the notebook-announcement region.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
  deleteNotebook: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

const soundMocks = vi.hoisted(() => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

vi.mock("./sound", () => soundMocks);

import App from "./App";

const NOTEBOOKS = [
  { id: "nb-1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  { id: "nb-2", name: "Chemistry", created_at: "2026-01-01T00:00:00Z" },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("announces 'Notebook Biology deleted' in the notebook-announcement region on delete", async () => {
  window.localStorage.setItem("research_token", "delete-announce-token");
  apiMocks.me.mockResolvedValue({ id: "u1", email: "u@example.test" });
  apiMocks.listNotebooks.mockResolvedValueOnce(NOTEBOOKS).mockResolvedValue([NOTEBOOKS[1]]);
  apiMocks.deleteNotebook.mockResolvedValue(undefined);
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  apiMocks.getAISettings.mockRejectedValue(new Error("offline"));
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local"));
  // After delete, the list refreshes without the deleted notebook.
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOKS[1]]);
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete Biology" }));
  fireEvent.click(await screen.findByRole("button", { name: /confirm delete biology/i }));
  await waitFor(() => expect(apiMocks.deleteNotebook).toHaveBeenCalledWith("nb-1"));
  const region = await screen.findByRole("status", { name: "Site announcements" });
  await waitFor(() => expect(region.textContent).toMatch(/Notebook Biology deleted/));
});
