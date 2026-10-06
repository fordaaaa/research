// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SearchPanel from "./SearchPanel";

vi.mock("./ThinkingDots", () => ({
  default: ({ state, theme }: { state: string; theme?: string }) => (
    <span role="img" aria-label={state} data-theme={theme} />
  ),
}));

afterEach(cleanup);

it("shows a contrasting orb while keyless source search is pending", () => {
  const onSearch = vi.fn(() => new Promise<[]>(() => {}));
  render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("Search your sources…"), { target: { value: "cells" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
  expect(onSearch).toHaveBeenCalledWith("cells", expect.any(AbortSignal));
  expect(screen.getByRole("img", { name: "searching" }).getAttribute("data-theme")).toBe("dark");
});
