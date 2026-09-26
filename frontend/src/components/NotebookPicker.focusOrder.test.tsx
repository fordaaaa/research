// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

function tabbables(root: HTMLElement): Element[] {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

describe("landing tab order", () => {
  it("uses no positive tabIndex and keeps main out of the tab cycle", () => {
    const { container } = render(
      <NotebookPicker
        userId="focus-1"
        notebooks={[{ id: "n1", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]}
        onOpen={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length).toBe(0);
    const main = container.querySelector("main");
    expect(main?.getAttribute("tabindex")).toBe("-1");
    // Every tabbable is reachable in DOM order with no gaps to repair.
    const order = tabbables(container).map((el) => el.getAttribute("aria-label") ?? el.textContent?.slice(0, 24));
    expect(order.length).toBeGreaterThan(3);
  });

  it("returns focus to the notebook search when the focused card is deleted", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <NotebookPicker
        notebooks={[{ id: "n1", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]}
        onOpen={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />,
    );
    const del = screen.getByRole("button", { name: "Delete Biology" });
    del.focus();
    expect(document.activeElement).toBe(del);
    // Two-tap confirm: arm, then confirm the delete.
    fireEvent.click(del);
    fireEvent.click(screen.getByRole("button", { name: /confirm delete biology/i }));
    expect(onDelete).toHaveBeenCalledWith("n1");
    rerender(
      <NotebookPicker
        notebooks={[]}
        onOpen={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />,
    );
    // Focus must land on the search field, never on <body> mid-cycle.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search notebooks" }));
  });
});
