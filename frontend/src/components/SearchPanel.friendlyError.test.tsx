// @vitest-environment jsdom
// Round 18 item 7 (422 display audit): raw pydantic payloads must never
// render — neither "[object Object]" nor `loc` voice. Search failures show
// a friendly line instead.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { search } from "../api";
import SearchPanel from "./SearchPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("api search() normalizes a 422 pydantic body (no loc voice, no [object Object])", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [{ loc: ["query", "offset"], msg: "Input should be greater than 0", type: "greater_than" }],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  await expect(search("nb1", "x")).rejects.toThrowError(/input should be greater than 0/i);
  await expect(search("nb1", "x")).rejects.toThrowError(/^((?!loc).)*$/is);
});

it("SearchPanel shows a friendly line when a search rejects with raw loc payload", async () => {
  const onSearch = vi
    .fn()
    .mockRejectedValue(new Error('[{"loc":["query","offset"],"msg":"bad","type":"greater_than"}]'));
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), {
    target: { value: "cells" },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByText(/search failed — try again/i)).toBeTruthy();
  expect(document.body.textContent ?? "").not.toMatch(/"loc"/);
});

it("SearchPanel keeps honest messages (no friendly override for clean errors)", async () => {
  const onSearch = vi.fn().mockRejectedValue(new Error("login required"));
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), {
    target: { value: "cells" },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  expect(await screen.findByText(/login required/i)).toBeTruthy();
});
