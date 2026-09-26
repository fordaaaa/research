// @vitest-environment jsdom
// Round 25 item 4 (FAILING first): after a successful export, focus stays on
// the Export control itself (NOT the pill's dismiss × — which stays
// clickable but is never auto-focused), and the persistent save region
// carries the "Exported" confirmation.
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

const soundMocks = vi.hoisted(() => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("keeps focus on the Export control and announces Exported in the save region", async () => {
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
  // Wait for the completion UI first (open-notebook heading focus settles
  // before the export tick commits), then assert the steady state.
  const dismiss = await screen.findByRole("button", { name: /dismiss export confirmation/i });
  // Focus is retained on the Export control after the download starts…
  await waitFor(() => expect(document.activeElement).toBe(exportButton));
  // …and the persistent save region carries the confirmation…
  expect(screen.getByRole("alert", { name: "Save announcement" }).textContent).toMatch(/exported/i);
  // …the pill still renders with a clickable (but NOT focused) dismiss ×…
  expect(document.activeElement).not.toBe(dismiss);
  fireEvent.click(dismiss);
  expect(screen.queryByRole("button", { name: /dismiss export confirmation/i })).toBeNull();
});
