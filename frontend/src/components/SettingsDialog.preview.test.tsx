// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog";

vi.mock("../api", () => ({
  getToken: () => null,
  getAISettings: vi.fn(),
}));

const soundMocks = vi.hoisted(() => ({ previewChime: vi.fn() }));
vi.mock("../sound", async () => {
  const actual = await vi.importActual<typeof import("../sound")>("../sound");
  return { ...actual, previewChime: soundMocks.previewChime };
});

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

it("offers a Preview button next to the chimes toggle that plays without enabling", () => {
  renderDialog();
  const preview = screen.getByRole("button", { name: /preview chime/i });
  expect(preview.hasAttribute("disabled")).toBe(false);
  fireEvent.click(preview);
  expect(soundMocks.previewChime).toHaveBeenCalledTimes(1);
});
