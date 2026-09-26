// @vitest-environment jsdom
// Round 12 item 7: the appearance live region must be mounted with explicit
// live semantics while the dialog is open, and every distinct theme/font
// change must land text in it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api", () => ({
  getToken: () => window.localStorage.getItem("research_token"),
  getAISettings: vi.fn().mockRejectedValue(new Error("offline")),
}));

import SettingsDialog from "./SettingsDialog";

afterEach(() => cleanup());

// The dialog now hosts two status regions (appearance + sound): scope to
// the Appearance section so the sound region never collides.
function appearanceStatus() {
  return within(screen.getByRole("region", { name: "Appearance" })).getByRole("status");
}

function renderDialog() {
  return render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
    />,
  );
}

describe("round12 item7 appearance announce", () => {
  it("mounts an explicit live region and announces each theme change", () => {
    renderDialog();
    const live = appearanceStatus();
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("aria-atomic")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
    expect(appearanceStatus().textContent).toMatch(/ocean theme on/i);

    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(appearanceStatus().textContent).toMatch(/night theme on/i);
  });

  it("announces font changes through the same region", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Maple Mono" }));
    expect(appearanceStatus().textContent).toMatch(/maple mono font on/i);
  });
});
