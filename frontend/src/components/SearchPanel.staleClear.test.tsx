// @vitest-environment jsdom
// Round 18 item 2: deleting the only source must clear stale search results
// ("1 passage across 1 source" beside an empty library). SearchPanel accepts
// a sourcesVersion token (App passes sources.length); when it changes, any
// shown source-results are cleared.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SearchHit } from "../api";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

const hit: SearchHit = {
  source_id: "s1",
  source_title: "Only source",
  pages: [1],
  score: 1,
  snippet: "some passage text",
  matched_terms: ["passage"],
};

it("clears source results when sourcesVersion changes (source deleted)", async () => {
  const onSearch = vi.fn().mockResolvedValue([hit]);
  const { rerender } = render(
    <SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} sourcesVersion={1} />,
  );
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), {
    target: { value: "passage" },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByRole("status", { name: "Search result count" })).toBeTruthy();
  // The last source is deleted → version drops to 0 → stale count clears.
  rerender(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} sourcesVersion={0} />);
  expect(screen.queryByRole("status", { name: "Search result count" })).toBeNull();
});

it("keeps results when sourcesVersion is unchanged", async () => {
  const onSearch = vi.fn().mockResolvedValue([hit]);
  const { rerender } = render(
    <SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} sourcesVersion={1} />,
  );
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), {
    target: { value: "passage" },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByRole("status", { name: "Search result count" })).toBeTruthy();
  rerender(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} sourcesVersion={1} />);
  expect(screen.getByRole("status", { name: "Search result count" })).toBeTruthy();
});
