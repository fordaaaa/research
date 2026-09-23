// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({ getAISettings: vi.fn().mockRejectedValue(new Error("offline")) }));

import SettingsDialog from "./SettingsDialog";

afterEach(() => cleanup());

it("lets appearance change without configuring AI", () => {
  const onAppearanceChange = vi.fn();
  render(<SettingsDialog open onClose={vi.fn()} onChanged={vi.fn()} appearance={{ theme: "paper", font: "readable" }} onAppearanceChange={onAppearanceChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Night" }));
  expect(onAppearanceChange).toHaveBeenCalledWith({ theme: "night", font: "readable" });
  fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
  expect(onAppearanceChange).toHaveBeenCalledWith({ theme: "paper", font: "maple" });
});
