// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => window.localStorage.getItem("research_token"),
  getAISettings: vi.fn().mockRejectedValue(new Error("offline")),
}));

import SettingsDialog from "./SettingsDialog";

afterEach(() => cleanup());

describe("round8 item9 theme announce", () => {
  it('announces theme changes via a live region ("Ocean theme on")', () => {
    render(
      <SettingsDialog
        open
        onClose={vi.fn()}
        onChanged={vi.fn()}
        appearance={{ theme: "paper", font: "readable" }}
        onAppearanceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
    // Scoped to Appearance: the dialog also hosts the named sound region.
    const live = within(screen.getByRole("region", { name: "Appearance" })).getByRole("status");
    expect(live.textContent).toMatch(/ocean theme on/i);
  });

  it("announces font changes via the live region", () => {
    render(
      <SettingsDialog
        open
        onClose={vi.fn()}
        onChanged={vi.fn()}
        appearance={{ theme: "paper", font: "readable" }}
        onAppearanceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    expect(
      within(screen.getByRole("region", { name: "Appearance" })).getByRole("status").textContent,
    ).toMatch(/maple mono/i);
  });
});
