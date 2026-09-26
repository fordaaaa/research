// @vitest-environment jsdom
// Round 24 item 2 (FAILING first): clicking the active theme must NOT re-fire
// "Night theme on" — announce only on actual change.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => window.localStorage.getItem("research_token"),
  getAISettings: vi.fn().mockRejectedValue(new Error("offline")),
}));

import SettingsDialog from "./SettingsDialog";

afterEach(() => cleanup());

it("same-theme click stays silent; a real change announces", () => {
  const onAppearanceAnnounce = vi.fn();
  render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "night", font: "readable" }}
      onAppearanceChange={vi.fn()}
      onAppearanceAnnounce={onAppearanceAnnounce}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Night" }));
  expect(onAppearanceAnnounce).not.toHaveBeenCalled();
  // Scoped to Appearance: the dialog also hosts the named sound region.
  const appearanceStatus = () =>
    within(screen.getByRole("region", { name: "Appearance" })).getByRole("status");
  expect(appearanceStatus().textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
  expect(onAppearanceAnnounce).toHaveBeenCalledWith("Ocean theme on");
  expect(appearanceStatus().textContent).toMatch(/ocean theme on/i);
});
