// @vitest-environment jsdom
// Round 13 item 6: hits with identical snippet text group into one row with
// an honest "also appears in N other source(s)" note naming them. Distinct
// snippets render untouched.
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

it("triplicated snippet text renders once with an also-in-2 note", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    hit("s1", "Alpha", "cells have structure"),
    hit("s2", "Beta", "cells have structure"),
    hit("s3", "Gamma", "cells have structure"),
  ]);
  const { container } = render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  await screen.findByText(/cells have structure/);
  expect(container.querySelectorAll("ul li").length).toBe(1);
  expect(screen.getByText(/also appears in 2 other sources/i)).toBeTruthy();
  expect(screen.getByText(/Beta/)).toBeTruthy();
  expect(screen.getByText(/Gamma/)).toBeTruthy();
  // Honest totals stay intact in the count region.
  expect(screen.getByRole("status", { name: "Search result count" }).textContent).toMatch(/3 passages across 3 sources/);
});

it("distinct snippets render as separate rows with no grouping note", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    hit("s1", "Alpha", "cells have structure"),
    hit("s2", "Beta", "mitochondria make energy"),
  ]);
  const { container } = render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  await screen.findByText(/mitochondria make energy/);
  expect(container.querySelectorAll("ul li").length).toBe(2);
  expect(screen.queryByText(/also appears in/i)).toBeNull();
});
