// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SourceSummary, SourceDetail } from "../api";
import * as api from "../api";
import SourceList from "./SourceList";
import ReaderModal from "./ReaderModal";
import SearchPanel from "./SearchPanel";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn() };
});

afterEach(() => cleanup());

describe("round7 item1 markdown stripped in display strings", () => {
  it("SourceList row shows stripped title", () => {
    const source: SourceSummary = {
      id: "s1",
      notebook_id: "n1",
      kind: "paste",
      title: "# Title",
      tags: [],
      meta: { page_count: 1 },
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
    };
    render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.queryByText("# Title")).toBeNull();
  });

  it("ReaderModal header shows stripped title", async () => {
    vi.mocked(api.getSource).mockResolvedValue({
      id: "s1",
      notebook_id: "n1",
      kind: "paste",
      title: "# Title",
      tags: [],
      meta: { page_count: 1 },
      created_at: "2026-01-01T00:00:00Z",
      chunk_count: 1,
      pages: [{ number: 1, text: "body" }],
      chunks: [],
    } satisfies SourceDetail);
    render(<ReaderModal sourceId="s1" onClose={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Title" })).toBeTruthy();
    expect(screen.queryByText("# Title")).toBeNull();
  });

  it("SearchPanel shows stripped snippet and title", async () => {
    const onSearch = vi.fn().mockResolvedValue([
      {
        source_id: "s1",
        source_title: "# Title",
        pages: [1],
        score: 5,
        snippet: "# Heading body here",
        matched_terms: ["heading"],
      },
    ]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "heading" } });
    fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    expect(await screen.findByText("Title")).toBeTruthy();
    expect(await screen.findByText("Heading body here")).toBeTruthy();
    expect(screen.queryByText("# Title")).toBeNull();
  });
});
