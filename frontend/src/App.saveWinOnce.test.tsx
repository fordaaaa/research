// @vitest-environment jsdom
// Round 16 item 4: win announcements fire once and clear on the next
// meaningful action (notebook switch/home), never re-heard afterwards.
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

it("first-save win announces once and clears after leaving the notebook", async () => {
  window.localStorage.setItem("research_token", "r16i4-token");
  window.localStorage.setItem("notaeo:onboarding:r16i4-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r16i4-user", email: "r16i4@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
    { id: "nb2", name: "History", created_at: "2026-01-02T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
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
  fireEvent.change(screen.getByLabelText(/paste body/i), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  const saveStatus = await screen.findByLabelText("Save announcement");
  await vi.waitFor(() => expect(saveStatus.textContent).toMatch(/first source saved/i));
  // Unrelated action: go home. The win must not survive to be re-heard.
  fireEvent.click(screen.getByRole("button", { name: "Notaeo home" }));
  expect(screen.queryByLabelText("Save announcement")).toBeNull();
  // Opening a different notebook must not re-expose nb1's win.
  fireEvent.click(await screen.findByRole("button", { name: "Open History" }));
  await screen.findByRole("button", { name: /paste text instead/i });
  expect(screen.queryByLabelText("Save announcement")).toBeNull();
});
