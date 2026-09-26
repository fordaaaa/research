// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

it("never renders raw float scores, only the honest passage count", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    {
      source_id: "s1",
      source_title: "Cell notes",
      pages: [1],
      score: 24.581453659370776,
      snippet: "cells have structure",
      matched_terms: ["cells"],
    },
  ]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);

  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));

  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  const list = await screen.findByText(/cells have structure/);
  expect(list).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\d+\.\d{5,}/);
  expect(document.body.textContent).not.toMatch(/\d+ matches/);
  expect(screen.getByText("1 passage across 1 source")).toBeTruthy();
});
