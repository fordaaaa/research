// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const EXPECTED: [string, string][] = [
  ["Create or open a notebook", "notebook"],
  ["Add a source", "source"],
  ["Search or ask", "search"],
  ["Export or review 1 card", "review"],
];

it("renders each row as a button that fires its navigation action", () => {
  const onAction = vi.fn();
  render(<Checklist userId="nav-1" onAction={onAction} />);
  for (const [title, action] of EXPECTED) {
    const row = screen.getByRole("button", { name: new RegExp(title) });
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(row);
    expect(onAction).toHaveBeenCalledWith(action);
  }
  expect(onAction).toHaveBeenCalledTimes(4);
});

it("clicking rows never checks them off (navigation only, no fake completion)", () => {
  const onAction = vi.fn();
  render(<Checklist userId="nav-2" onAction={onAction} />);
  expect(screen.getByText("0 of 4")).toBeTruthy();
  for (const [title] of EXPECTED) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
  }
  expect(screen.getByText("0 of 4")).toBeTruthy();
  expect(screen.queryByText("All done ✓")).toBeNull();
});
