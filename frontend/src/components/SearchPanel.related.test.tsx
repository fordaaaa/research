// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";
import type { SearchHit } from "../api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("can rerun the same query with related matching, and return to keyword matching", async () => {
  const search = vi.fn().mockResolvedValue([]);
  render(<SearchPanel onSearch={search} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "photosynthsis" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
  await waitFor(() => expect(search).toHaveBeenCalledWith("photosynthsis", expect.any(AbortSignal)));
  fireEvent.click(screen.getByLabelText("Find related passages"));
  await waitFor(() => expect(search).toHaveBeenCalledWith("photosynthsis", expect.any(AbortSignal), true));
  expect(screen.getByText(/Related matching can include/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Find related passages"));
  await waitFor(() => expect(search).toHaveBeenCalledTimes(3));
  expect(search.mock.calls[2]).toEqual(["photosynthsis", expect.any(AbortSignal)]);
});
it("discards an exact response that arrives after switching to related matching", async () => {
  let resolve!: (hits: SearchHit[]) => void;
  const search = vi.fn().mockImplementationOnce(() => new Promise<SearchHit[]>((done) => { resolve = done; })).mockResolvedValue([]);
  render(<SearchPanel onSearch={search} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ATP" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
  fireEvent.click(screen.getByLabelText("Find related passages"));
  const signal = search.mock.calls[0][1] as AbortSignal;
  expect(signal.aborted).toBe(true);
  await act(async () => resolve([{ source_id: "old", source_title: "Old source", pages: [1], score: 1, snippet: "Old exact response", matched_terms: [] }]));
  expect(screen.queryByText("Old exact response")).toBeNull();
  await waitFor(() => expect(search).toHaveBeenCalledWith("ATP", expect.any(AbortSignal), true));
});
