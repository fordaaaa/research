// @vitest-environment jsdom
// Item 5 (FAILING first, browser-faithful): focusing a DISABLED button is a
// no-op in real browsers. The export handler sets exportedTick BEFORE
// exportBusy clears, so the old [exportedTick]-only effect called focus()
// while the Export control was still disabled — focus fell to BODY (the
// judge saw it wander to the demo link). This test makes jsdom behave like
// a browser (ignore focus() on disabled targets) and asserts focus still
// lands on the Export control.
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

const realFocus = HTMLElement.prototype.focus;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  HTMLElement.prototype.focus = realFocus;
});

it("post-export focus lands on the Export control even though it disables mid-flight", async () => {
  // Browser-faithful focus: disabled targets cannot take focus.
  HTMLElement.prototype.focus = function (...args: unknown[]) {
    if ((this as HTMLButtonElement).disabled) return;
    return realFocus.apply(this, args as []);
  };
  window.localStorage.setItem("research_token", "export-focus-token");
  apiMocks.me.mockResolvedValue({ id: "u1", email: "u@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  // Defer the download a tick so the disabled-under-focus window is real.
  apiMocks.downloadNotebook.mockImplementation(
    () => new Promise((resolve) => window.setTimeout(() => resolve({ blob: new Blob(), filename: "x.zip" }), 10)),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  fireEvent.click(exportButton);
  // Browsers drop focus to BODY when the focused control disables mid-flight
  // (jsdom keeps it — emulate the drop so this test is browser-faithful).
  if (document.activeElement === exportButton) (document.activeElement as HTMLElement).blur();
  expect(document.activeElement).not.toBe(exportButton);
  await screen.findByRole("button", { name: /dismiss export confirmation/i });
  await waitFor(() => expect(document.activeElement).toBe(exportButton));
});

it("dismissing the Exported pill from its × returns focus to the Export control", async () => {
  window.localStorage.setItem("research_token", "export-focus-token");
  apiMocks.me.mockResolvedValue({ id: "u1", email: "u@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  fireEvent.click(exportButton);
  // The pill unmounts under a focused × — without a restore, focus falls
  // to BODY. It must return to the Export control instead.
  const dismiss = await screen.findByRole("button", { name: /dismiss export confirmation/i });
  dismiss.focus();
  fireEvent.click(dismiss);
  await waitFor(() => expect(screen.queryByRole("button", { name: /dismiss export confirmation/i })).toBeNull());
  expect(document.activeElement).toBe(exportButton);
});
