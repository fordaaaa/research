// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

const HIT = {
  source_id: "s1",
  source_title: "Cell notes",
  pages: [1],
  score: 24.581453659370776,
  snippet: "cells have structure",
  matched_terms: ["cells"],
};

it("shows an honest passage count, never the relevance score as matches", async () => {
  const onSearch = vi.fn().mockResolvedValue([HIT]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);

  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));

  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  await screen.findByText(/cells have structure/);
  expect(screen.getByText("1 passage across 1 source")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\d+ matches/);
  expect(document.body.textContent).not.toMatch(/\d+\.\d{5,}/);
});

it("pluralizes the honest passage count", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    HIT,
    { ...HIT, source_id: "s2", snippet: "more cells here" },
  ]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);

  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));

  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByText("2 passages across 2 sources")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\d+ matches/);
});

it("counts distinct sources when passages share a source", async () => {
  const onSearch = vi.fn().mockResolvedValue([
    HIT,
    { ...HIT, snippet: "more cells here" },
  ]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);

  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));

  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByText("2 passages across 1 source")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/\d+ matches/);
});
