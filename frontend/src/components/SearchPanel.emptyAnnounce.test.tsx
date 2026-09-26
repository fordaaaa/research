// @vitest-environment jsdom
// Round 25 item 3 (FAILING first): SEARCH EMPTY audit.
// - Sources mode, LIVE auto-search path (typing only, no submit): an empty
//   result must render the persistent zero-count region ("0 passages…") and
//   leave focus in the input (no focus move on empty — announce only).
// - Web mode empty: no count region exists at all — extend the zero-count
//   announcement there too, likewise without moving focus.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

const searchWebMock = vi.hoisted(() => vi.fn());

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, searchWeb: searchWebMock };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("sources auto-search empty announces 0 passages and keeps focus in the input", async () => {
  vi.useFakeTimers();
  const onSearch = vi.fn().mockResolvedValue([]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  const input = screen.getByPlaceholderText(/search your sources/i);
  fireEvent.change(input, { target: { value: "nothinghere" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(onSearch).toHaveBeenCalledWith("nothinghere", expect.anything());
  const region = screen.getByRole("status", { name: "Search result count" });
  expect(region.textContent).toMatch(/0 passages across 0 sources/);
  expect(document.activeElement).toBe(input);
});

it("web mode empty announces the zero count and keeps focus in the input", async () => {
  searchWebMock.mockResolvedValue([]);
  render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
  const input = screen.getByPlaceholderText(/search the web/i);
    fireEvent.change(input, { target: { value: "nothinghere" } });
    // Live flow is type + Enter: submit the form with focus in the input
    // (a submit-button click would park focus on the button instead).
    input.focus();
    fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(searchWebMock).toHaveBeenCalled());
  const region = await screen.findByRole("status", { name: "Web search result count" });
  expect(region.textContent).toMatch(/0 public results/);
  expect(document.activeElement).toBe(input);
});
