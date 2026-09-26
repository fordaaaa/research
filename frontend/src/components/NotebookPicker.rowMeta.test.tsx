// @vitest-environment jsdom
// Round 23 item 4 (FAILING first): library rows show name + open/delete only —
// no "Created {date}" line that clipped to "Creat…" gibberish at 1280px.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

const NOTEBOOKS = [
  { id: "nb1", name: "Biology 101", created_at: "2026-01-02T03:04:05Z" },
  { id: "nb2", name: "Chemistry", created_at: "2025-12-31T23:59:59Z" },
];

it("library rows carry no created-date text", () => {
  render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Open Biology 101" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete Biology 101" })).toBeTruthy();
  // Scope to the library list: the "Create" submit button elsewhere
  // legitimately contains "Creat", so match the full date line instead.
  const list = screen.getByRole("list");
  expect(list.textContent).not.toMatch(/Created/);
  expect(list.textContent).not.toMatch(/2026|2025/);
});
