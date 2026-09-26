// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../sound", () => ({
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import Checklist from "./Checklist";

afterEach(() => cleanup());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

it("pending rows show step numbers, done rows show check", () => {
  render(<Checklist userId="glyph-user" />);
  const buttons = screen.getAllByRole("button", { name: /not done|done/ });
  expect(buttons).toHaveLength(4);
  // Pending: step numbers 1-4, no checkmark glyph in the badge.
  ["1", "2", "3", "4"].forEach((n, i) => {
    const badge = buttons[i].querySelector('span[aria-hidden="true"]');
    expect(badge?.textContent).toBe(n);
  });
  expect(document.body.textContent).not.toMatch(/text-transparent/);
});

it("done rows show check only when done", () => {
  render(
    <Checklist
      userId="glyph-user-done"
      hasNotebook
      hasSource
      hasSearched
      hasExportedOrReviewed
    />,
  );
  const buttons = screen.getAllByRole("button", { name: /done/ });
  buttons.forEach((btn) => {
    const badge = btn.querySelector('span[aria-hidden="true"]');
    expect(badge?.textContent).toBe("✓");
  });
});
