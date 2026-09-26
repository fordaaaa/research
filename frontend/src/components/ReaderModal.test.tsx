// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn(), createNote: vi.fn() };
});

afterEach(() => cleanup());
beforeEach(() => {
  vi.mocked(api.createNote).mockReset();
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
    expect(await screen.findByText("Page two")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText("Page one")).toBeTruthy();
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

  it("saves an important passage as a cited note and opens notes", async () => {
    vi.mocked(api.getSource).mockResolvedValueOnce({
      id: "123456789abc", notebook_id: "abcdef123456", kind: "pdf", title: "Cell Biology", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 3, text: "Cells have membranes." }], chunks: [{ seq: 0, pages: [3], text: "Cells have membranes." }],
      important_passages: [{ text: "Cells have membranes.", score: 0.8, chunk_seq: 0, pages: [3] }],
    } satisfies SourceDetail);
    const created: api.Note = {
      id: "111111111111", notebook_id: "abcdef123456", title: "Evidence from Cell Biology, p. 3",
      body: "> Cells have membranes.\n\nSource: Cell Biology, p. 3", tags: [],
      citations: [{ source_id: "123456789abc", chunk_seq: 0 }], rev: 1,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    vi.mocked(api.createNote).mockResolvedValue(created);
    const onEvidenceSaved = vi.fn();
    const onViewNotes = vi.fn();
    render(<ReaderModal sourceId="123456789abc" onClose={vi.fn()} onEvidenceSaved={onEvidenceSaved} onViewNotes={onViewNotes} />);

    fireEvent.click(await screen.findByRole("button", { name: /save passage to notes/i }));
    await waitFor(() => expect(api.createNote).toHaveBeenCalledWith("abcdef123456", {
      title: "Evidence from Cell Biology, p. 3",
      body: "> Cells have membranes.\n\nSource: Cell Biology, p. 3",
      citations: [{ source_id: "123456789abc", chunk_seq: 0 }],
    }));
    await waitFor(() => expect(onEvidenceSaved).toHaveBeenCalledWith(created));
    const saved = screen.getByRole("button", { name: "Saved to notes" });
    expect(saved).toHaveProperty("disabled", true);
    fireEvent.click(saved);
    expect(api.createNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /view notes/i }));
    expect(onViewNotes).toHaveBeenCalledTimes(1);
  });

  it("keeps the reader open and reports a failed evidence save", async () => {
    vi.mocked(api.getSource).mockResolvedValueOnce({
      id: "123456789abc", notebook_id: "abcdef123456", kind: "pdf", title: "Cell Biology", tags: [],
      meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 3, text: "Cells have membranes." }], chunks: [{ seq: 0, pages: [3], text: "Cells have membranes." }],
      important_passages: [{ text: "Cells have membranes.", score: 0.8, chunk_seq: 0, pages: [3] }],
    } satisfies SourceDetail);
    vi.mocked(api.createNote).mockRejectedValue(new Error("Save failed"));
    const onEvidenceSaved = vi.fn();
    render(<ReaderModal sourceId="123456789abc" onClose={vi.fn()} onEvidenceSaved={onEvidenceSaved} />);

    fireEvent.click(await screen.findByRole("button", { name: /save passage to notes/i }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Save failed");
    expect(onEvidenceSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /save passage to notes/i })).toHaveProperty("disabled", false);
  });

  it("keeps generated note titles within the API limit for long source and page lists", async () => {
    const pages = Array.from({ length: 45 }, (_, i) => i + 1);
    vi.mocked(api.getSource).mockResolvedValueOnce({
      id: "123456789abc", notebook_id: "abcdef123456", kind: "pdf", title: "A".repeat(300), tags: [],
      meta: {}, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
      pages: [{ number: 1, text: "Useful quote" }], chunks: [{ seq: 0, pages, text: "Useful quote" }],
      important_passages: [{ text: "Useful quote", score: 0.8, chunk_seq: 0, pages }],
    } satisfies SourceDetail);
    vi.mocked(api.createNote).mockResolvedValue({} as api.Note);
    render(<ReaderModal sourceId="123456789abc" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /save passage to notes/i }));
    await waitFor(() => expect(api.createNote).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.createNote).mock.calls[0][1];
    expect(body.title.length).toBeLessThanOrEqual(200);
    expect(body.body).toContain("Source: ");
    expect(body.citations).toEqual([{ source_id: "123456789abc", chunk_seq: 0 }]);
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

  it("shows the offline folio loader while a source opens", () => {
    vi.mocked(api.getSource).mockImplementationOnce(() => new Promise<SourceDetail>(() => {}));
    render(<ReaderModal sourceId="source-9" onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent ?? "").toContain("Opening source…");
  });
});
