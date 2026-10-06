// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./sound", () => ({
  playBoot: vi.fn(), playSuccess: vi.fn(), previewChime: vi.fn(),
  isSoundEnabled: () => false, setSoundEnabled: vi.fn(),
}));

import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: false, ok: true }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function desktopSettings() {
  fireEvent(window, new CustomEvent("notaeo:desktop-command", { detail: "settings" }));
}

it("offers device settings before signing in", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(screen.getByText("Appearance", { exact: true })).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/settings/ai"))).toBe(false);
});

it("opens one settings dialog from repeated native menu commands", async () => {
  render(<App />);
  desktopSettings(); desktopSettings();
  expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(screen.getAllByRole("dialog", { name: "Settings" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  await waitFor(() => expect(document.activeElement?.id).toBe("main-content"));
});

it("ignores malformed and unsupported desktop commands", () => {
  render(<App />);
  for (const detail of ["delete", { action: "settings" }, null]) {
    fireEvent(window, new CustomEvent("notaeo:desktop-command", { detail }));
  }
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
});
