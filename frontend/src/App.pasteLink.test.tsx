// @vitest-environment jsdom
// Round 25 item 2 (FAILING first, App level): clicking "Paste it as a
// source →" expands the paste editor AND focuses the paste title input with
// a polite "Paste form open" announcement.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

it("paste link expands the editor, focuses the title, and announces", async () => {
  window.localStorage.setItem("research_token", "r25i2-token");
  window.localStorage.setItem("notaeo:onboarding:r25i2-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r25i2-user", email: "r25i2@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const bottomNav = document.querySelector('nav[aria-label="Notebook sections"].fixed');
  expect(bottomNav, "mobile bottom nav missing").toBeTruthy();
  fireEvent.click(within(bottomNav as HTMLElement).getByRole("button", { name: "Search" }));
  fireEvent.click(await screen.findByRole("button", { name: /paste it as a source/i }));
  // Back on the library pane with the paste editor expanded…
  await waitFor(() => expect(screen.getByPlaceholderText("Title")).toBeTruthy());
  // …focus in the named title input…
  await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Title")));
  // …and a polite announcement.
  expect(screen.getByRole("status", { name: "Paste form announcement" }).textContent).toMatch(
    /paste form open/i,
  );
});
