// @vitest-environment jsdom
// Round 13 item 3: the result-count live region stays mounted on zero
// results and announces the honest zero count (no SR silence).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

it("keeps the count region mounted with an honest zero count on empty results", async () => {
  const onSearch = vi.fn().mockResolvedValue([]);
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/search your sources/i), { target: { value: "nothinghere" } });
  fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
  await waitFor(() => expect(onSearch).toHaveBeenCalled());
  const region = await screen.findByRole("status", { name: "Search result count" });
  expect(region.textContent).toMatch(/0 passages across 0 sources/);
});
