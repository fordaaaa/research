// @vitest-environment jsdom
// Round 11 item 3: the empty-workspace START-HERE panel must offer a paste
// affordance ("Have text? Paste it as a source") that navigates to the
// sources pane paste form.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
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

it("empty state shows a paste affordance that navigates to the sources pane", async () => {
  window.localStorage.setItem("research_token", "r11i3-token");
  apiMocks.me.mockResolvedValue({ id: "r11i3-user", email: "r11i3@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  // Go to a non-library section so the START-HERE panel renders (the
  // mobile Search section; the desktop Search view tab shares the name).
  const bottomNav = document.querySelector('nav[aria-label="Notebook sections"].fixed');
  expect(bottomNav, "mobile bottom nav missing").toBeTruthy();
  fireEvent.click(within(bottomNav as HTMLElement).getByRole("button", { name: "Search" }));
  const affordance = await screen.findByRole("button", { name: /paste it as a source/i });
  expect(affordance).toBeTruthy();
  fireEvent.click(affordance);
  // Navigated back to the library pane where the paste form lives. Round 25
  // item 2: the link expands the editor outright, so the toggle reads "Hide
  // paste editor" and the title input is present and focused.
  expect(await screen.findByRole("button", { name: /hide paste editor/i })).toBeTruthy();
  expect(screen.getByPlaceholderText("Title")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
});
