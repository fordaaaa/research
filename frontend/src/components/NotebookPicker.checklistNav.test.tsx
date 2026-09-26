// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../sound", () => ({
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

function renderPicker() {
  render(
    <NotebookPicker
      userId="checklist-nav-1"
      notebooks={[]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

it("checklist rows deep-link: notebook focuses the name field, source does not", () => {
  renderPicker();
  fireEvent.click(screen.getByRole("button", { name: /create or open a notebook/i }));
  expect(document.activeElement).toBe(screen.getByPlaceholderText(/new notebook name/i));
  // Round 22 item 4: the "Add a source" row must NOT land on the notebook
  // name field — with no notebooks open it takes the demo path instead.
  fireEvent.click(screen.getByRole("button", { name: /add a source/i }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /demo notebook/i }));
  expect(document.activeElement).not.toBe(screen.getByPlaceholderText(/new notebook name/i));
});

it("checklist rows deep-link: search focuses library search, review focuses demo", () => {
  renderPicker();
  fireEvent.click(screen.getByRole("button", { name: /search or ask/i }));
  expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search notebooks" }));
  fireEvent.click(screen.getByRole("button", { name: /export or review/i }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /demo notebook/i }));
});
