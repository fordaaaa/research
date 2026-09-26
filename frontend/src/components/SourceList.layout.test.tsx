// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "A very long cell biology notes title that should truncate and never reflow",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

it("keeps title truncated and actions shrink-0 when confirm arms", () => {
  render(
    <SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Show Source actions/i }));
  const actions = screen.getByTestId("swipe-row-actions");
  fireEvent.click(actions.querySelector('button[aria-label="Delete A very long cell biology notes title that should truncate and never reflow"]')!);
  const confirm = actions.querySelector('button[aria-label^="Confirm delete"]') as HTMLButtonElement;
  expect(confirm.className).toMatch(/shrink-0/);
  // Title row keeps its clamp contract (round 19: line-clamp-2, never more)
  // so arming Confirm? cannot crush it.
  const title = screen.getByText("A very long cell biology notes title that should truncate and never reflow");
  expect(title.tagName).toBe("BUTTON");
  expect(title.className).toMatch(/line-clamp-2/);
  const textWrap = title.closest("div.min-w-0");
  expect(textWrap).toBeTruthy();
});
