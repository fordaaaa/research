// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => window.localStorage.getItem("research_token"),
  getAISettings: vi.fn().mockRejectedValue(new Error("offline")),
}));

import SettingsDialog from "./SettingsDialog";

afterEach(() => cleanup());

function hasMinHeight24(className: string): boolean {
  // Tailwind min-h scale: min-h-6 = 24px, min-h-11 = 44px, min-h-8 = 32px, etc.
  const match = className.match(/min-h-(\d+)/);
  if (!match) return false;
  const step = Number(match[1]);
  const px = step === 11 ? 44 : step === 14 ? 56 : step * 4;
  return px >= 24;
}

function hasMinWidth44(className: string): boolean {
  const match = className.match(/min-w-(\d+)/);
  if (!match) return false;
  const step = Number(match[1]);
  const px = step === 11 ? 44 : step === 14 ? 56 : step * 4;
  return px >= 44;
}

it("gives the Settings close button a 44px hit area while keeping its visual size", () => {
  render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
    />,
  );
  const close = screen.getByRole("button", { name: "Close settings" });
  expect(hasMinHeight24(close.className)).toBe(true);
  expect(hasMinWidth44(close.className)).toBe(true);
});
