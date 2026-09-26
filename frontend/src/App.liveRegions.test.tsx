// @vitest-environment jsdom
// Round 15 item 2: status regions carry explicit aria-live (+ atomic).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  addPaste: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
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

it("notebook announcement region exposes explicit polite live attributes", async () => {
  window.localStorage.removeItem("research_token");
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  render(<App />);
  const notebookStatus = await screen.findByLabelText("Site announcements");
  expect(notebookStatus.getAttribute("aria-live")).toBe("polite");
  expect(notebookStatus.getAttribute("aria-atomic")).toBe("true");
});

it("save announcement region exposes explicit live attributes", async () => {
  window.localStorage.setItem("research_token", "r15i2-token");
  window.localStorage.setItem("notaeo:onboarding:r15i2-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r15i2-user", email: "r15i2@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.addPaste.mockResolvedValue({ saved: true });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  apiMocks.listSources.mockResolvedValue([
    {
      id: "s1",
      notebook_id: "nb1",
      kind: "paste",
      title: "Cells",
      tags: [],
      meta: {},
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
    },
  ]);
  fireEvent.click(await screen.findByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  const saveStatus = await screen.findByLabelText("Save announcement");
  expect(saveStatus.getAttribute("aria-live")).not.toBeNull();
  expect(saveStatus.getAttribute("aria-atomic")).toBe("true");
});
