// @vitest-environment jsdom
// Round 16 item 1: Settings dialog moves focus in, traps Tab, and restores trigger on Escape.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => null,
  getAISettings: vi.fn(),
}));

import SettingsDialog from "./SettingsDialog";

const BASE = {
  onClose: vi.fn(),
  onChanged: vi.fn(),
  appearance: { theme: "paper", font: "readable" } as const,
  onAppearanceChange: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("moves focus into the dialog on open", () => {
  render(<SettingsDialog {...BASE} open />);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(dialog.contains(document.activeElement)).toBe(true);
});

it("Escape restores focus to the trigger, never BODY", () => {
  const trigger = document.createElement("button");
  trigger.textContent = "open settings";
  document.body.appendChild(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const { unmount } = render(<SettingsDialog {...BASE} onClose={onClose} open />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
  expect(document.activeElement).toBe(trigger);
  expect(document.activeElement).not.toBe(document.body);
  trigger.remove();
});
