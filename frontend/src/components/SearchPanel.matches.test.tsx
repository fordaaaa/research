// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

it("labels the honest passage count, never hits or score-as-matches", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    {
      source_id: "s1",
      source_title: "Cell notes",
      pages: [1],
      score: 21.4,
      snippet: "cells have structure",
      matched_terms: ["cells"],
    },
  ]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByText("1 passage across 1 source")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/hits/);
  expect(document.body.textContent).not.toMatch(/\d+ matches/);
});
