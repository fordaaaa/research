// @vitest-environment jsdom
// Item 3 (FAILING first): the nav tab "Search" and the form submit "Search"
// collide as duplicate accessible names. The submit keeps its visible text
// but carries aria-label "Submit search" so every name query is unique.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

it("the submit button is named Submit search with unchanged visible text", () => {
  render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
  const submit = screen.getByRole("button", { name: "Submit search" });
  expect(submit.textContent).toMatch(/search/i);
  expect(submit.textContent?.trim()).toBe("Search");
  // No bare "Search" button remains in the panel (no collision).
  expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
});
