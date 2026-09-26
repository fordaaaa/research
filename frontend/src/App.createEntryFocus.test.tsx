// @vitest-environment jsdom
// Round 17 item 2: after create, focus lands on the add-source entry control
// (the checklist's "add a source" step), not the side-rail/sources list —
// while the "Notebook X created" announcement survives.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  createNotebook: vi.fn(),
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

it("focuses the add-source entry control after create and keeps the announcement", async () => {
  window.localStorage.setItem("research_token", "r17i2-token");
  window.localStorage.setItem("notaeo:onboarding:r17i2-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r17i2-user", email: "r17i2@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb-new", name: "Chemistry 101", created_at: "2026-01-01T00:00:00Z",
  });

  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Chemistry 101" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

  const announcement = await screen.findByRole("status", { name: "Site announcements" });
  await waitFor(() => expect(announcement.textContent ?? "").toContain("Chemistry 101"));

  await waitFor(() => {
    const card = document.querySelector('[data-tour="add-sources"]');
    expect(card, "add-sources card missing").toBeTruthy();
    expect(card!.contains(document.activeElement)).toBe(true);
  });
  expect(document.activeElement).not.toBe(document.body);
});
