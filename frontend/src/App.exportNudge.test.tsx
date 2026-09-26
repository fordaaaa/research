// @vitest-environment jsdom
// Round 22 item 2 (FAILING first): a 0-source export must nudge visibly AND
// move focus to the nudge AND announce it (role=status) — the old path only
// rendered text, so keyboard/AT users got a dead click. Zero requests fired.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
  downloadNotebook: vi.fn(),
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

const NOTEBOOK = { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

async function openEmptyWorkspace() {
  window.localStorage.setItem("research_token", "nudge2-token");
  window.localStorage.setItem("notaeo:onboarding:nudge2-user", "done");
  apiMocks.me.mockResolvedValue({ id: "nudge2-user", email: "nudge2@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  // Let the open-time sources-pane reveal settle (double-rAF focus move) so
  // it cannot race the nudge focus asserted below.
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  return exportButton;
}

it("empty export nudges with focus + announcement and fires zero requests", async () => {
  const exportButton = await openEmptyWorkspace();
  fireEvent.click(exportButton);

  const nudge = await screen.findByText(/add a source first/i);
  expect(nudge.getAttribute("role")).toBe("status");
  await waitFor(() => expect(document.activeElement).toBe(nudge));
  expect(apiMocks.downloadNotebook).not.toHaveBeenCalled();
});

it("re-clicking export re-announces the nudge (no stale-text silence)", async () => {
  const exportButton = await openEmptyWorkspace();
  fireEvent.click(exportButton);
  const first = await screen.findByText(/add a source first/i);
  await waitFor(() => expect(document.activeElement).toBe(first));

  // Move focus away, then trigger the nudge again: it must come back and
  // re-announce (fresh node, not a stale identical-text no-op).
  (exportButton as HTMLElement).focus();
  fireEvent.click(exportButton);
  const nudges = await screen.findAllByText(/add a source first/i);
  expect(nudges).toHaveLength(1);
  await waitFor(() => expect(document.activeElement).toBe(nudges[0]));
  expect(apiMocks.downloadNotebook).not.toHaveBeenCalled();
});
