// @vitest-environment jsdom
// Item 4 (FAILING first): the "Paste it as a source →" start-here link must
// focus the paste TITLE input even when the paste editor is ALREADY open.
// UploadZone's showPaste effect only fires on the collapsed→open transition,
// so with an open editor the link left focus on the (now possibly unmounted)
// link instead of moving it to #paste-title.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

vi.mock("./sound", () => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("paste link focuses the title input when the editor is already open", async () => {
  window.localStorage.setItem("research_token", "go-paste-token");
  window.localStorage.setItem("notaeo:onboarding:go-paste-user", "done");
  apiMocks.me.mockResolvedValue({ id: "go-paste-user", email: "go@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  // Pre-open the paste editor via its own toggle (editor now mounted).
  fireEvent.click(await screen.findByRole("button", { name: /paste text instead/i }));
  await screen.findByPlaceholderText("Title");
  // Click the start-here paste link (research view, empty library).
  fireEvent.click(await screen.findByRole("button", { name: /paste it as a source/i }));
  // Focus must move to the named title input — not stay on the link,
  // and never strand on body or a notebook control.
  await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Title")));
});
