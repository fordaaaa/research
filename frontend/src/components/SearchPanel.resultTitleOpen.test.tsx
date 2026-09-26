// @vitest-environment jsdom
// Round 23 item 5 (FAILING first): grouped search-result titles are themselves
// the reader opener — clicking the title calls onOpenSource with the source id.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

const HITS = [
  {
    source_id: "s1",
    source_title: "Cell notes",
    pages: [1],
    score: 21.4,
    snippet: "cells have structure",
    matched_terms: ["cells"],
  },
];

it("clicking a grouped result title opens the reader with the source id", async () => {
  const onSearch = vi.fn().mockResolvedValue(HITS);
  const onOpenSource = vi.fn();
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} onOpenSource={onOpenSource} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  const title = await screen.findByRole("button", { name: /cell notes/i });
  fireEvent.click(title);
  expect(onOpenSource).toHaveBeenCalledWith("s1", expect.anything());
});
