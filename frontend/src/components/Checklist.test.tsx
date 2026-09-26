// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

it("renders 2 of 4 from genuine props, completes only on real 4/4, and persists", () => {
  const { unmount, rerender } = render(
    <Checklist
      userId="user-1"
      hasNotebook
      hasSource={false}
      hasSearched={true}
      hasExportedOrReviewed={false}
    />,
  );
  expect(screen.getByText("2 of 4")).toBeTruthy();
  expect(screen.queryByText("All done ✓")).toBeNull();
  expect(playSuccess).not.toHaveBeenCalled();
  // Genuine completion of the remaining items checks them off and celebrates.
  rerender(
    <Checklist
      userId="user-1"
      hasNotebook
      hasSource
      hasSearched
      hasExportedOrReviewed
    />,
  );
  expect(screen.getByRole("progressbar", { name: "4 of 4 steps complete" })).toBeTruthy();
  expect(screen.getByText("All done ✓")).toBeTruthy();
  expect(playSuccess).toHaveBeenCalled();
  unmount();
  // persists per-user: remount keeps completion even with no derived props
  render(
    <Checklist userId="user-1" hasNotebook={false} hasSearched={false} hasExportedOrReviewed={false} />,
  );
  expect(screen.getByRole("progressbar", { name: "4 of 4 steps complete" })).toBeTruthy();
});
