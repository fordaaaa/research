// @vitest-environment jsdom
// Round 15 item 3: sources-mode hits group by source with header + count.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SearchHit } from "../api";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

const hit = (source_id: string, source_title: string, snippet: string): SearchHit => ({
  source_id,
  source_title,
  pages: [1],
  score: 1,
  snippet,
  matched_terms: ["cells"],
});

async function searchWith(hits: SearchHit[]) {
  const onSearch = vi.fn().mockResolvedValue(hits);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), {
    target: { value: "cells" },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  await screen.findByRole("status", { name: "Search result count" });
}

it("two sources render two groups with headers and counts", async () => {
  await searchWith([
    hit("s1", "Alpha", "cells have structure"),
    hit("s1", "Alpha", "cells divide daily"),
    hit("s2", "Beta", "mitochondria make energy"),
  ]);
  const groups = screen.getAllByTestId("search-source-group");
  expect(groups.length).toBe(2);
  expect(groups[0].textContent).toMatch(/Alpha/);
  expect(groups[0].textContent).toMatch(/2/);
  expect(groups[1].textContent).toMatch(/Beta/);
  expect(screen.getByRole("status", { name: "Search result count" }).textContent).toMatch(
    /3 passages across 2 sources/,
  );
});

it("a single source renders one group", async () => {
  await searchWith([hit("s1", "Alpha", "cells have structure")]);
  expect(screen.getAllByTestId("search-source-group").length).toBe(1);
});
