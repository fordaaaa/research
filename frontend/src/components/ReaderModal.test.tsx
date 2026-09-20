// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn() };
});

afterEach(() => cleanup());
beforeEach(() => {
  vi.mocked(api.getSource).mockResolvedValue({
    id: "source-1", notebook_id: "notebook-1", kind: "pdf", title: "Notes", tags: [],
    meta: { page_count: 3 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 3,
    pages: [{ number: 1, text: "Page one" }, { number: 2, text: "Page two" }, { number: 3, text: "Page three" }],
    chunks: [],
  } satisfies SourceDetail);
});

describe("ReaderModal mobile paging", () => {
  it("locks body scroll, supports keyboard paging, and restores scroll on close", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ReaderModal sourceId="source-1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Page two")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Page one")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    rerender(<ReaderModal sourceId={null} onClose={onClose} />);
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("advances on a horizontal pointer swipe without changing page bounds", async () => {
    render(<ReaderModal sourceId="source-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
    const body = screen.getByText("Page one").parentElement!;
    fireEvent.pointerDown(body, { clientX: 180, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(body, { clientX: 80, clientY: 105, pointerId: 1 });
    expect(screen.getByText("Page two")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("Page two").parentElement!, { clientX: 80, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(screen.getByText("Page two").parentElement!, { clientX: 180, clientY: 105, pointerId: 2 });
    expect(screen.getByText("Page one")).toBeTruthy();
  });

  it("surfaces deterministic important passages without an AI key", async () => {
    vi.mocked(api.getSource).mockResolvedValueOnce({
      id: "source-2", notebook_id: "notebook-1", kind: "url", title: "Research article", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 1, text: "Full article text" }], chunks: [],
      site_name: "Example Journal", byline: "Ada Lovelace", canonical_url: "https://example.test/article",
      published: "2026-09-20", important_passages: [{
        text: "The central result is reproducible.", score: 0.82, chunk_seq: 0, pages: [1],
      }],
    } satisfies SourceDetail);

    render(<ReaderModal sourceId="source-2" onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: /important passages/i })).toBeTruthy();
    expect(screen.getByText("The central result is reproducible.")).toBeTruthy();
    expect(screen.getByText(/local extraction/i)).toBeTruthy();
  });

  it("ignores a stale source response when the reader switches sources", async () => {
    let resolveFirst!: (value: SourceDetail) => void;
    const first = new Promise<SourceDetail>((resolve) => { resolveFirst = resolve; });
    const second: SourceDetail = {
      id: "source-2", notebook_id: "notebook-1", kind: "pdf", title: "Second source", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 1, text: "Second page" }], chunks: [],
    };
    vi.mocked(api.getSource).mockImplementationOnce(() => first);
    vi.mocked(api.getSource).mockResolvedValueOnce(second);

    const { rerender } = render(<ReaderModal sourceId="source-1" onClose={vi.fn()} />);
    rerender(<ReaderModal sourceId="source-2" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Second page")).toBeTruthy());
    resolveFirst({
      id: "source-1", notebook_id: "notebook-1", kind: "pdf", title: "First source", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 1, text: "First page" }], chunks: [],
    } satisfies SourceDetail);
    await waitFor(() => expect(api.getSource).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("First page")).toBeNull();
    expect(screen.getByText("Second page")).toBeTruthy();
  });

  it("exposes the reader as a dialog with touch-sized pager controls", async () => {
    render(<ReaderModal sourceId="source-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    const prev = screen.getByRole("button", { name: /prev/i });
    const next = screen.getByRole("button", { name: /next/i });
    const close = screen.getByRole("button", { name: /close reader/i });
    expect(prev.className).toMatch(/min-h-11/);
    expect(next.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-w-11/);
  });
});
