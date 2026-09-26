// @vitest-environment jsdom
// Round 16 item 3: a filter hiding everything must say so + offer Clear search.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

function renderTwo() {
  render(
    <NotebookPicker
      notebooks={[
        { id: "b", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
        { id: "h", name: "History", created_at: "2026-01-02T00:00:00Z" },
      ]}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

it("filtered-empty acknowledges the filter and clear works", () => {
  renderTwo();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search notebooks" }), {
    target: { value: "zzz-nope" },
  });
  expect(screen.getByText(/no notebooks match/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
  expect(screen.getByRole("button", { name: "Open Biology" })).toBeTruthy();
});

it("true-empty keeps the create-one-above copy", () => {
  render(
    <NotebookPicker notebooks={[]} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByText(/no notebooks yet/i)).toBeTruthy();
});
