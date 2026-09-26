// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  getAISettings: vi.fn(),
}));

vi.mock("../api", () => apiMocks);

import SettingsDialog from "./SettingsDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("Enable AI submit meets 44px touch target", () => {
  apiMocks.getToken.mockReturnValue(null);
  apiMocks.getAISettings.mockResolvedValue({ configured: false, provider: null, model: null });
  render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
    />,
  );
  const enable = screen.getByRole("button", { name: /enable ai/i });
  expect(enable.className).toMatch(/min-h-11/);
});
