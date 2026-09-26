// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

it("moves focus to the panel heading with a live announcement on mode toggle", () => {
  render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
  const heading = screen.getByRole("heading", { name: "Search the web" });
  expect(document.activeElement).toBe(heading);
  expect(screen.getByRole("status", { name: "Search mode announcement" }).textContent).toMatch(/web search/i);

  fireEvent.click(screen.getByRole("button", { name: "Your sources" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Search your sources" }));
  expect(screen.getByRole("status", { name: "Search mode announcement" }).textContent).toMatch(/sources search/i);
});
