// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SearchHit } from "../api";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

const echoHit: SearchHit = {
  source_id: "s1",
  source_title: "My Notes",
  chunk_seq: 0,
  pages: [1],
  score: 0.9,
  snippet: "My Notes Photosynthesis converts light into energy.",
  matched_terms: ["photosynthesis"],
} as SearchHit;

const plainHit: SearchHit = {
  source_id: "s1",
  source_title: "My Notes",
  chunk_seq: 1,
  pages: [2],
  score: 0.8,
  snippet: "Chlorophyll absorbs sunlight in the leaf.",
  matched_terms: ["chlorophyll"],
} as SearchHit;

describe("round8 item4 excerpt dedupe", () => {
  async function searchWith(hits: SearchHit[]) {
    const onSearch = vi.fn().mockResolvedValue(hits);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "photosynthesis" } });
    fireEvent.submit(screen.getByPlaceholderText(/search your sources/i).closest("form")!);
    await screen.findByRole("status", { name: "Search result count" });
  }

  it("strips a leading title-echo from the snippet", async () => {
    await searchWith([echoHit]);
    expect(screen.queryByText("My Notes Photosynthesis converts light into energy.")).toBeNull();
    expect(screen.getByText("Photosynthesis converts light into energy.")).toBeTruthy();
  });

  it("leaves non-echo snippets untouched", async () => {
    await searchWith([plainHit]);
    expect(screen.getByText("Chlorophyll absorbs sunlight in the leaf.")).toBeTruthy();
  });
});
