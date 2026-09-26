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
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

function renderList(onDelete = vi.fn().mockResolvedValue(undefined)) {
  const onOpen = vi.fn();
  const result = render(<SourceList sources={[source]} onOpen={onOpen} onDelete={onDelete} />);
  return { onDelete, onOpen, container: result.container };
}

function openActions() {
  fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
}

function swipeButton(container: HTMLElement, label: string): HTMLButtonElement {
  const actions = container.querySelector('[data-testid="swipe-row-actions"]');
  const button = actions?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`missing swipe action ${label}`);
  return button;
}

it("arms on first click and deletes only on the second click", () => {
  const { onDelete, container } = renderList();
  openActions();
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  expect(onDelete).not.toHaveBeenCalled();
  const confirm = swipeButton(container, "Confirm delete Cell biology notes");
  expect(confirm.textContent).toMatch(/confirm/i);
  fireEvent.click(confirm);
  expect(onDelete).toHaveBeenCalledWith("source-1");
});

it("cancels the armed confirm on Escape", () => {
  const { onDelete, container } = renderList();
  openActions();
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  fireEvent.keyDown(swipeButton(container, "Confirm delete Cell biology notes"), { key: "Escape" });
  expect(swipeButton(container, "Delete Cell biology notes")).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});

it("keeps the armed confirm on blur (no disarm for focus-shifting users)", () => {
  const { onDelete, container } = renderList();
  openActions();
  fireEvent.click(swipeButton(container, "Delete Cell biology notes"));
  fireEvent.blur(swipeButton(container, "Confirm delete Cell biology notes"));
  expect(swipeButton(container, "Confirm delete Cell biology notes")).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});
