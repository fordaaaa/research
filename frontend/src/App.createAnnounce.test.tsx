// @vitest-environment jsdom
// Round 12 item 1 (App level): App navigates to the workspace on create, which
// unmounts NotebookPicker — so the App must carry the focus + announcement.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  createNotebook: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
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

it("announces the created notebook by name and keeps focus off <body> after create", async () => {
  window.localStorage.setItem("research_token", "r12i1-token");
  window.localStorage.setItem("notaeo:onboarding:r12i1-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r12i1-user", email: "r12i1@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb-new", name: "Chemistry 101", created_at: "2026-01-01T00:00:00Z",
  });

  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Chemistry 101" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

  // The announcement survives the navigation to the workspace.
  const announcement = await screen.findByRole("status", { name: "Site announcements" });
  await waitFor(() => expect(announcement.textContent ?? "").toContain("Chemistry 101"));
  expect((announcement.textContent ?? "").length).toBeGreaterThan(0);
  // Focus lands on the workspace, never stranded on <body>.
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
});
