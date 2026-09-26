// @vitest-environment jsdom
// Round 21 item 3 (FAILING first): an armed delete confirm disarms via a
// window capture-phase Escape even when focus is NOT on the confirm button
// (both lists), and NotebookPicker auto-disarms on list refresh.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

const SOURCE: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

const NOTEBOOKS = [{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }];

function swipeButton(container: HTMLElement, label: string): HTMLButtonElement {
  const actions = container.querySelector('[data-testid="swipe-row-actions"]');
  const button = actions?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`missing swipe action ${label}`);
  return button;
}

it("SourceList: window Escape with focus on BODY disarms the armed confirm", () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { container } = render(<SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  expect(swipeButton(container, "Confirm delete Cell biology notes")).toBeTruthy();
  // Focus is nowhere near the confirm button (deleted-row path strands BODY).
  (document.activeElement as HTMLElement | null)?.blur?.();
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(swipeButton(container, "Delete Cell biology notes")).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});

it("NotebookPicker: window Escape with focus in the search field disarms the armed confirm", () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn().mockResolvedValue(undefined)} onDelete={onDelete} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(screen.getByRole("button", { name: /confirm delete biology/i })).toBeTruthy();
  // Move focus away from the confirm button, then press Escape there.
  screen.getByRole("searchbox", { name: "Search notebooks" }).focus();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Delete Biology" })).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});

it("NotebookPicker: a notebooks refresh auto-disarms the armed confirm", () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn().mockResolvedValue(undefined)} onDelete={onDelete} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(screen.getByRole("button", { name: /confirm delete biology/i })).toBeTruthy();
  rerender(
    <NotebookPicker
      notebooks={[...NOTEBOOKS, { id: "b2c3d4e5f6a7", name: "Chemistry", created_at: "2026-01-02T00:00:00Z" }]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={onDelete}
    />,
  );
  expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();
  expect(onDelete).not.toHaveBeenCalled();
});
