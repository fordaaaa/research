// @vitest-environment jsdom
// Round 11 item 1 (App chain): onPaste must NOT refresh source counts when
// the backend reports saved:false (nothing persisted); the forced retry
// refreshes exactly once.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  addPaste: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});

vi.mock("../sound", () => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import App from "../App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

async function openWorkspace() {
  window.localStorage.setItem("research_token", "r11i1-token");
  apiMocks.me.mockResolvedValue({ id: "r11i1-user", email: "r11i1@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  // Library pane is the default mobile section: paste toggle is reachable.
  fireEvent.click(await screen.findByRole("button", { name: /paste text instead/i }));
}

it("unsaved warn does not refresh counts; forced save refreshes exactly once", async () => {
  apiMocks.addPaste
    .mockResolvedValueOnce({ saved: false, duplicate_of: { id: "d1", title: "Existing note" } })
    .mockResolvedValueOnce({ saved: true });
  await openWorkspace();
  const baseline = apiMocks.listSources.mock.calls.length;
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  await screen.findByText(/you already have this exact text/i);
  // Nothing was persisted: no refresh happened.
  expect(apiMocks.listSources.mock.calls.length).toBe(baseline);
  expect(apiMocks.addPaste).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));
  await waitFor(() => expect(apiMocks.addPaste).toHaveBeenCalledTimes(2));
  expect(apiMocks.addPaste.mock.calls[1][3]).toMatchObject({ force: true });
  await waitFor(() => expect(apiMocks.listSources.mock.calls.length).toBe(baseline + 1));
});
