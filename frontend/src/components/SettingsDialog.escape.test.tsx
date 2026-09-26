// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => null,
  getAISettings: vi.fn(),
}));

import SettingsDialog from "./SettingsDialog";

const PROPS = {
  open: true,
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

it("closes on Escape via a capture-phase listener (mirrors FirstRunTour)", () => {
  const onClose = vi.fn();
  render(<SettingsDialog {...PROPS} onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  // A bubble-phase listener registered elsewhere that stops propagation must not block dismissal.
  const stopper = (event: Event) => event.stopPropagation();
  document.addEventListener("keydown", stopper, true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  document.removeEventListener("keydown", stopper, true);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does not close on other keys", () => {
  const onClose = vi.fn();
  render(<SettingsDialog {...PROPS} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), { key: "Enter" });
  expect(onClose).not.toHaveBeenCalled();
});
