// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("SourceList mobile actions", () => {
  it("keeps source actions reachable without hover and deletes safely", async () => {
    let resolveDelete!: () => void;
    const onDelete = vi.fn(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
    const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
    const arm = container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Delete Cell biology notes"]') as HTMLButtonElement;
    expect(arm).toBeTruthy();
    expect(arm.className).toContain("min-h-11");
    // First tap only arms the inline confirm — nothing destructive fires.
    fireEvent.click(arm);
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Confirm delete Cell biology notes"]') as HTMLButtonElement;
    fireEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledWith("source-1");
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText(/deleting/i).length).toBeGreaterThan(0);

    resolveDelete();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Delete Cell biology notes" }).length).toBeGreaterThan(0));
  });

  it("surfaces delete failures instead of dropping them", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("delete failed"));
    const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
    fireEvent.click(container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Delete Cell biology notes"]')!);
    fireEvent.click(container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Confirm delete Cell biology notes"]')!);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/delete failed/i)).toBeTruthy();
  });

  it("labels URL sources with a readable badge", () => {
    render(<SourceList sources={[{ ...source, kind: "url" }]} onOpen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("URL")).toBeTruthy();
  });

  it("keeps long titles readable: truncating text block, stacked meta, compact actions toggle", () => {
    render(
      <SourceList
        sources={[{ ...source, title: "Cell Structure Notes" }]}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const title = screen.getByText("Cell Structure Notes");
    expect(title.tagName).toBe("BUTTON");
    expect(title.className).toContain("line-clamp-2");
    expect(title.parentElement?.className).toContain("min-w-0");

    // Meta sits on its own line below the title, never beside it.
    const meta = screen.getByText(/page\(s\)/);
    expect(meta.tagName).toBe("P");
    expect(meta.previousElementSibling).toBe(title);

    // The always-visible toggle is a compact icon button, not a text pill.
    const toggle = screen.getByRole("button", { name: /show source actions/i });
    expect(toggle.className).toContain("min-w-11");
    expect(toggle.textContent).not.toMatch(/Actions/);

    // Kind badge must not grow; the Read control keeps its label.
    expect(screen.getByText("PDF").className).toContain("shrink-0");
    expect(screen.getByRole("button", { name: "Read Cell Structure Notes" })).toBeTruthy();
  });
});
