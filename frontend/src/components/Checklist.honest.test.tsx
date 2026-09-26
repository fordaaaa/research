// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../sound", () => ({
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import { playSuccess } from "../sound";
import Checklist from "./Checklist";

afterEach(() => cleanup());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const TITLES = [
  "Create or open a notebook",
  "Add a source",
  "Search or ask",
  "Export or review 1 card",
];

it("offers no manual toggle path: clicking items never checks them off", () => {
  const onAction = vi.fn();
  render(<Checklist userId="honest-1" onAction={onAction} />);
  expect(screen.getByText("0 of 4")).toBeTruthy();
  for (const title of TITLES) {
    // Rows are navigation buttons, not checkboxes — no checked state to fake.
    const row = screen.getByRole("button", { name: new RegExp(`${title} — not done`) });
    expect(row.querySelector('[role="checkbox"]')).toBeNull();
    fireEvent.click(row);
  }
  expect(onAction).toHaveBeenCalledTimes(4);
  expect(screen.getByText("0 of 4")).toBeTruthy();
  expect(screen.queryByText("All done ✓")).toBeNull();
  expect(playSuccess).not.toHaveBeenCalled();
  // Nothing fake persisted either.
  cleanup();
  render(<Checklist userId="honest-1" />);
  expect(screen.getByText("0 of 4")).toBeTruthy();
});

it("derives each item from real props only", () => {
  const { unmount } = render(<Checklist userId="honest-2" hasNotebook />);
  expect(screen.getByRole("button", { name: new RegExp(`${TITLES[0]} — done`) })).toBeTruthy();
  expect(screen.getByRole("button", { name: new RegExp(`${TITLES[1]} — not done`) })).toBeTruthy();
  expect(screen.getByText("1 of 4")).toBeTruthy();
  unmount();
  localStorage.clear();

  const props = { hasSource: true, hasSearched: true, hasExportedOrReviewed: true } as const;
  render(<Checklist userId="honest-3" hasNotebook {...props} />);
  for (const title of TITLES) {
    expect(screen.getByRole("button", { name: new RegExp(`${title} — done`) })).toBeTruthy();
  }
  expect(screen.getByText("All done ✓")).toBeTruthy();
  expect(playSuccess).toHaveBeenCalled();
});
