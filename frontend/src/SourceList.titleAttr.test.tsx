// @vitest-environment jsdom
// Round 20 items 5/6/7 (FAILING first).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("./sound", () => ({ playSuccess: vi.fn(), isSoundEnabled: () => false }));

import SourceList from "./components/SourceList";

afterEach(() => cleanup());

const SOURCE = {
  id: "s1",
  notebook_id: "book",
  kind: "pdf" as const,
  title: "A very long source title that truncates in the row layout",
  tags: [],
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

it("item 6: truncated source title button carries title={fullTitle}", () => {
  render(<SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn()} />);
  const titleButton = screen.getByRole("button", { name: SOURCE.title });
  expect(titleButton.getAttribute("title")).toBe(SOURCE.title);
});

it("item 6b: reader title carries title={fullTitle}", async () => {
  const { default: ReaderModal } = await import("./components/ReaderModal");
  const api = await import("./api");
  vi.spyOn(api, "getSource").mockResolvedValue({
    id: "s1",
    notebook_id: "book",
    kind: "pdf",
    title: SOURCE.title,
    tags: [],
    meta: { page_count: 1 },
    created_at: "2026-01-01T00:00:00Z",
    chunk_count: 1,
    pages: [{ number: 1, text: "Page one" }],
    chunks: [],
  });
  render(<ReaderModal sourceId="s1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  const heading = document.getElementById("reader-title")!;
  expect(heading.getAttribute("title")).toBe(SOURCE.title);
  vi.restoreAllMocks();
});
