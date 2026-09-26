// @vitest-environment jsdom
// Round 11 item 4: delete-confirm must NOT disarm on blur (keyboard and
// focus-shifting users); Escape still disarms.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";
import NotebookPicker from "./NotebookPicker";

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

function sourceConfirmButton(container: HTMLElement, label: string): HTMLButtonElement {
  const actions = container.querySelector('[data-testid="swipe-row-actions"]');
  const button = actions?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`missing swipe action ${label}`);
  return button;
}

describe("round11 item4 blur keeps delete-confirm armed", () => {
  it("SourceList: blur keeps the confirm armed; Escape disarms", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /show source actions/i }));
    fireEvent.click(sourceConfirmButton(container, "Delete Cell biology notes"));
    fireEvent.blur(sourceConfirmButton(container, "Confirm delete Cell biology notes"));
    // Still armed after blur: the confirm button survives focus shifts.
    expect(sourceConfirmButton(container, "Confirm delete Cell biology notes")).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
    // Escape still disarms.
    fireEvent.keyDown(sourceConfirmButton(container, "Confirm delete Cell biology notes"), { key: "Escape" });
    expect(sourceConfirmButton(container, "Delete Cell biology notes")).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("NotebookPicker: blur keeps the notebook delete-confirm armed; Escape disarms", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <NotebookPicker
        notebooks={[{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]}
        onOpen={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
    const confirm = screen.getByRole("button", { name: /confirm delete biology/i });
    fireEvent.blur(confirm);
    expect(screen.getByRole("button", { name: /confirm delete biology/i })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: /confirm delete biology/i }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Delete Biology" })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
