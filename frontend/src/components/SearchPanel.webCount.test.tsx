// @vitest-environment jsdom
// Item 1 (FAILING first): web mode needs parity with sources mode — a
// visible count header in a named live region ("N public results…"), plus
// the honest zero-count announcement when empty. Sources mode already has
// "N passages across M sources" in role=status "Search result count".
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

const searchWebMock = vi.hoisted(() => vi.fn());

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, searchWeb: searchWebMock };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RESULTS = [
  { title: "Cell structure", url: "https://example.test/cells", snippet: "Cells have structure" },
  { title: "More cells", url: "https://example.test/more", snippet: "More about cells" },
];

function goWeb() {
  render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
  return screen.getByPlaceholderText(/search the web/i);
}

it("web results render a visible count in the named web-count region", async () => {
  searchWebMock.mockResolvedValue(RESULTS);
  const input = goWeb();
  fireEvent.change(input, { target: { value: "cells" } });
  input.focus();
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(searchWebMock).toHaveBeenCalled());
  const region = await screen.findByRole("status", { name: "Web search result count" });
  expect(region.textContent).toMatch(/2 public results/);
  // Visible parity with the sources count header — not screen-reader-only.
  expect(region.classList.contains("sr-only")).toBe(false);
});

it("a single web result uses the singular", async () => {
  searchWebMock.mockResolvedValue([RESULTS[0]]);
  const input = goWeb();
  fireEvent.change(input, { target: { value: "cells" } });
  input.focus();
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(searchWebMock).toHaveBeenCalled());
  const region = await screen.findByRole("status", { name: "Web search result count" });
  expect(region.textContent).toMatch(/^1 public result$/);
});
