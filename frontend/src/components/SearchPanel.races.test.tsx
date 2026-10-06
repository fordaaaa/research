// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchPanel from "./SearchPanel";
import type { SearchHit, WebSearchResult } from "../api";

const apiMocks = vi.hoisted(() => ({ searchWeb: vi.fn() }));
vi.mock("../api", async () => ({ ...await vi.importActual<typeof import("../api")>("../api"), ...apiMocks }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("drops explicit source results after switching away and back", async () => {
  const pending = deferred<SearchHit[]>();
  const onSearch = vi.fn((_query: string, _signal?: AbortSignal) => pending.promise);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "q" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
  fireEvent.click(screen.getByRole("button", { name: "Your sources" }));
  await act(async () => pending.resolve([{ source_id: "s", source_title: "Stale source", pages: [1], score: 1, snippet: "Old result", matched_terms: [] }]));
  expect(screen.queryByText("Old result")).toBeNull();
  expect(onSearch.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
});

it("keeps the latest web results when explicit requests settle out of order", async () => {
  const first = deferred<WebSearchResult[]>();
  const second = deferred<WebSearchResult[]>();
  apiMocks.searchWeb.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "first" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "second" } });
  fireEvent.submit(input.closest("form")!);
  await act(async () => second.resolve([{ title: "Latest", url: "https://example.com/latest", snippet: "Newest result" }]));
  await act(async () => first.resolve([{ title: "Old", url: "https://example.com/old", snippet: "Old result" }]));
  expect(screen.getByText("Newest result")).toBeTruthy();
  expect(screen.queryByText("Old result")).toBeNull();
});

it("does not restore results for sources removed during an explicit search", async () => {
  const pending = deferred<SearchHit[]>();
  const props = { onSearch: vi.fn(() => pending.promise), onImportUrl: vi.fn() };
  const view = render(<SearchPanel {...props} sourcesVersion={1} />);
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "q" } });
  fireEvent.submit(input.closest("form")!);
  view.rerender(<SearchPanel {...props} sourcesVersion={0} />);
  await act(async () => pending.resolve([{ source_id: "s", source_title: "Deleted source", pages: [1], score: 1, snippet: "Deleted result", matched_terms: [] }]));
  expect(screen.queryByText("Deleted result")).toBeNull();
});
