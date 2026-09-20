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
    render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
    const deleteButton = screen.getByRole("button", { name: "Delete Cell biology notes" });
    expect(deleteButton.className).toContain("min-h-11");
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith("source-1");
    expect(deleteButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/deleting/i)).toBeTruthy();

    resolveDelete();
    await waitFor(() => expect(deleteButton.hasAttribute("disabled")).toBe(false));
  });

  it("surfaces delete failures instead of dropping them", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("delete failed"));
    render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Cell biology notes/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/delete failed/i)).toBeTruthy();
  });

  it("labels URL sources with a readable badge", () => {
    render(<SourceList sources={[{ ...source, kind: "url" }]} onOpen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("URL")).toBeTruthy();
  });
});
