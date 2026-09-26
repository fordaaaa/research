// @vitest-environment jsdom
// Round 24 item 6 (FAILING first): identical snippets with trivial
// differences (case/whitespace) must group; distinct texts must not.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

function hit(sourceId: string, title: string, snippet: string) {
  return { source_id: sourceId, source_title: title, pages: [1], score: 1, snippet, matched_terms: ["cells"] };
}

it("groups case/whitespace variants; keeps distinct texts apart", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    hit("s1", "Alpha", "Cells have structure"),
    hit("s2", "Beta", "  cells   HAVE structure  "),
    hit("s3", "Gamma", "Completely different passage"),
  ]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  await screen.findByText("3 passages across 3 sources");
  // Variants collapse: original display text kept on the primary row.
  expect(screen.getByText("Cells have structure")).toBeTruthy();
  expect(screen.queryByText("cells   HAVE structure")).toBeNull();
  expect(screen.getByText(/also appears in 1 other source/i)).toBeTruthy();
  expect(screen.getByText("Completely different passage")).toBeTruthy();
});
