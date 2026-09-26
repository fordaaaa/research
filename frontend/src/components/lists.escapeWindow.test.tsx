// @vitest-environment jsdom
// Round 25 item 1 (FAILING first): ESCAPE AUDIT — an armed delete Confirm
// must disarm via a window-level Escape keydown no matter where focus sits
// in the window (body, another control). Dispatches a REAL KeyboardEvent on
// window (closest to a live browser press) after arming via the real flow
// (clicking the Delete arm button). Assertions read the aria-label
// attribute directly (no accessible-name computation ambiguity) inside act()
// so the React flush is deterministic.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function pressEscapeOnWindow() {
  act(() => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
}

/** Raw aria-labels of every delete/confirm button currently in the DOM. */
function deleteLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button[aria-label^="Delete"], button[aria-label^="Confirm delete"]')).map(
    (button) => button.getAttribute("aria-label") ?? "",
  );
}

it("SourceList: real window Escape with focus on body disarms the armed confirm", () => {
  const { container } = render(
    <SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />,
  );
  // Arm via the real flow.
  fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));
  expect(deleteLabels(container)).toContain("Confirm delete Cell biology notes");
  // Focus sits on body — not the confirm button.
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.focus();
  expect(document.activeElement).toBe(document.body);
  pressEscapeOnWindow();
  expect(deleteLabels(container)).not.toContain("Confirm delete Cell biology notes");
  expect(deleteLabels(container)).toContain("Delete Cell biology notes");
});

it("SourceList: real window Escape with focus on another control disarms", () => {
  const { container } = render(
    <div>
      <input aria-label="unrelated field" />
      <SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));
  expect(deleteLabels(container)).toContain("Confirm delete Cell biology notes");
  screen.getByRole("textbox", { name: "unrelated field" }).focus();
  pressEscapeOnWindow();
  expect(deleteLabels(container)).not.toContain("Confirm delete Cell biology notes");
});

it("NotebookPicker: real window Escape with focus on body disarms the armed confirm", () => {
  const { container } = render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(deleteLabels(container)).toContain("Confirm delete Biology");
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.focus();
  pressEscapeOnWindow();
  expect(deleteLabels(container)).not.toContain("Confirm delete Biology");
  expect(deleteLabels(container)).toContain("Delete Biology");
});

it("NotebookPicker: Escape in the same frame as arming (before passive effects) still disarms", () => {
  const { container } = render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  // A live/fast Escape can land after the arming click commits but before
  // the arming render's passive effects register anything. Both dispatches
  // run inside one act() so no effect flushes between them — the disarm
  // must come from the mount-time listener, not an arm-time one.
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  expect(deleteLabels(container)).not.toContain("Confirm delete Biology");
  expect(deleteLabels(container)).toContain("Delete Biology");
});

it("NotebookPicker: real window Escape with focus in the search field disarms", () => {
  const { container } = render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(deleteLabels(container)).toContain("Confirm delete Biology");
  screen.getByRole("searchbox", { name: "Search notebooks" }).focus();
  pressEscapeOnWindow();
  expect(deleteLabels(container)).not.toContain("Confirm delete Biology");
});
