// @vitest-environment jsdom
// Round 24 item 1 (FAILING first): hidden swipe-action copies of Delete/Confirm
// share accessible names with visible inline buttons (SR rotor noise,
// automation traps). Swipe actions must render ONLY when revealed.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";
import { SwipeRow } from "./ui";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

it("SwipeRow mounts no hidden action twins when closed", () => {
  render(
    <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
      <span>Cell</span>
    </SwipeRow>,
  );
  expect(screen.queryByTestId("swipe-row-actions")).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show Source actions" }));
  expect(screen.getByTestId("swipe-row-actions")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
});

it("SourceList exposes a single Delete name when swipe is closed", () => {
  render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />);
  expect(screen.getAllByRole("button", { name: "Delete Cell biology notes" })).toHaveLength(1);
});
