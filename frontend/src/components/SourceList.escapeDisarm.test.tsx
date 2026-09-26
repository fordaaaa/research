// @vitest-environment jsdom
// Round 18 item 1: armed "Confirm?" disarms via Escape from ANY focus
// (row-level or list-level), not just the confirm button itself; and a
// sources-list refresh auto-disarms.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

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

function swipeButton(container: HTMLElement, label: string): HTMLButtonElement {
  const actions = container.querySelector('[data-testid="swipe-row-actions"]');
  const button = actions?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`missing swipe action ${label}`);
  return button;
}

function openActions() {
  fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
}

it("Escape with focus elsewhere (list root) disarms the armed confirm", () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);
  openActions();
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  expect(swipeButton(container, "Confirm delete Cell biology notes")).toBeTruthy();
  // Move focus away from the confirm button, then press Escape there.
  (screen.getByRole("button", { name: /hide source actions/i }) as HTMLElement).focus();
  const root = container.firstElementChild as HTMLElement;
  fireEvent.keyDown(root, { key: "Escape" });
  expect(swipeButton(container, "Delete Cell biology notes")).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});

it("a sources refresh auto-disarms the armed confirm", () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { container, rerender } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);
  openActions();
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  expect(swipeButton(container, "Confirm delete Cell biology notes")).toBeTruthy();
  rerender(<SourceList sources={[{ ...source }, { ...source, id: "source-2", title: "Second" }]} onOpen={vi.fn()} onDelete={onDelete} />);
  expect(container.querySelector('button[aria-label="Confirm delete Cell biology notes"]')).toBeNull();
});
