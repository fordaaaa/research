// @vitest-environment jsdom
// Item 8 (FAILING first): keyboard + screen-reader audit of the Sound
// section. Tab reaches the chime toggle (Space flips it + announces),
// Tab reaches Preview (Enter/click plays + announces). Labels stay put —
// this covers the missing live-region announcements.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog";

vi.mock("../api", () => ({
  getToken: () => null,
  getAISettings: vi.fn(),
}));

const soundMocks = vi.hoisted(() => ({
  previewChime: vi.fn(),
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => false),
  setSoundEnabled: vi.fn(),
}));
vi.mock("../sound", () => soundMocks);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderDialog() {
  render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
    />,
  );
}

function soundRegion() {
  return screen.getByRole("status", { name: "Sound announcement" });
}

it("toggling the chimes checkbox announces the new state", async () => {
  renderDialog();
  const toggle = screen.getByRole("checkbox", { name: "Interface chimes" });
  // Keyboard-reachable: no tabindex=-1, not disabled.
  expect(toggle.getAttribute("tabindex")).not.toBe("-1");
  expect(toggle.hasAttribute("disabled")).toBe(false);
  // Space-equivalent activation flips the toggle…
  toggle.focus();
  expect(document.activeElement).toBe(toggle);
  fireEvent.click(toggle);
  expect(soundMocks.setSoundEnabled).toHaveBeenCalledWith(true);
  // …and the flip is announced for screen readers.
  await waitFor(() => expect(soundRegion().textContent).toMatch(/interface chimes on/i));
});

it("activating Preview plays the chime and announces it", async () => {
  renderDialog();
  const preview = screen.getByRole("button", { name: /preview chime/i });
  expect(preview.getAttribute("tabindex")).not.toBe("-1");
  expect(preview.hasAttribute("disabled")).toBe(false);
  preview.focus();
  expect(document.activeElement).toBe(preview);
  // Enter-equivalent activation plays without enabling…
  fireEvent.click(preview);
  expect(soundMocks.previewChime).toHaveBeenCalledTimes(1);
  expect(soundMocks.setSoundEnabled).not.toHaveBeenCalled();
  // …and the playback is announced for screen readers.
  await waitFor(() => expect(soundRegion().textContent).toMatch(/preview/i));
});
