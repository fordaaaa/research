// @vitest-environment jsdom
// Round 23 item 1 (FAILING first): ALL desktop rail view buttons are tabbable
// (tabIndex 0 — no roving tabindex), while ArrowUp/Down/Home/End still move
// focus between them.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function openWorkspace() {
  // Round 25 item 6: the desktop rail only mounts at xl — stub an xl
  // viewport (mobile jsdom default would leave it unmounted).
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      onchange: null,
    }),
  );
  window.localStorage.setItem("research_token", "r23i1-token");
  window.localStorage.setItem("notaeo:onboarding:r23i1-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r23i1-user", email: "r23i1@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "nb1", name: "Bio", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Bio" }));
  await screen.findByRole("navigation", { name: "Workspace tools" });
}

function railViewButtons(): HTMLButtonElement[] {
  const rail = screen.getByRole("navigation", { name: "Workspace tools" });
  return Array.from(rail.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
    /Research|Deep research|Ask|Search|Study|Notes|Humanize|Skills/.test(b.textContent ?? ""),
  );
}

it("all rail view buttons are tabbable", async () => {
  await openWorkspace();
  const buttons = railViewButtons();
  expect(buttons.length).toBeGreaterThan(2);
  for (const button of buttons) {
    expect(button.tabIndex).toBe(0);
  }
});

it("arrow keys still move focus between rail view buttons; Home/End jump", async () => {
  await openWorkspace();
  const buttons = railViewButtons();
  buttons[0].focus();
  fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
});
