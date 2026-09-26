// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const sources: SourceSummary[] = [
  {
    id: "source-1",
    notebook_id: "notebook-1",
    kind: "pdf",
    title: "Cell biology notes",
    tags: [],
    meta: { page_count: 2 },
    created_at: "2026-01-01T00:00:00Z",
    chunk_count: 3,
  },
  {
    id: "source-2",
    notebook_id: "notebook-1",
    kind: "url",
    title: "Photosynthesis overview",
    tags: [],
    meta: { page_count: 1 },
    created_at: "2026-01-02T00:00:00Z",
    chunk_count: 1,
  },
];

it("renders an explicit Read button per row that opens the reader with the source id", () => {
  const onOpen = vi.fn();
  render(<SourceList sources={sources} onOpen={onOpen} onDelete={vi.fn()} />);
  const readButtons = screen.getAllByRole("button", { name: /^(read|open)/i });
  expect(readButtons.length).toBe(sources.length);
  fireEvent.click(screen.getByRole("button", { name: /read.*cell biology notes|open.*cell biology notes/i }));
  expect(onOpen).toHaveBeenCalledWith("source-1", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: /read.*photosynthesis|open.*photosynthesis/i }));
  expect(onOpen).toHaveBeenCalledWith("source-2", expect.anything());
});
