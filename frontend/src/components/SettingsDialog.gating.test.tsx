// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  getAISettings: vi.fn(),
}));

vi.mock("../api", () => apiMocks);

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

it("skips the authed settings fetch when no session token exists", () => {
  apiMocks.getToken.mockReturnValue(null);
  apiMocks.getAISettings.mockResolvedValue({ configured: false, provider: null, model: null });
  render(<SettingsDialog {...PROPS} />);
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(apiMocks.getAISettings).not.toHaveBeenCalled();
});

it("loads settings when a session token exists", async () => {
  apiMocks.getToken.mockReturnValue("session-token");
  apiMocks.getAISettings.mockResolvedValue({ configured: false, provider: null, model: null });
  render(<SettingsDialog {...PROPS} />);
  await waitFor(() => expect(apiMocks.getAISettings).toHaveBeenCalled());
});
