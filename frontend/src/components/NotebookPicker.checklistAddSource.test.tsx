// @vitest-environment jsdom
// Round 22 item 4 (FAILING first): the checklist "Add a source" row must NOT
// focus #new-notebook-name (rows 1+2 both did). It focuses the add-source
// entry when one exists, else the path into a notebook.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

const NOTEBOOKS = [
  { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  { id: "nb2", name: "History", created_at: "2026-01-01T00:00:00Z" },
];

const baseProps = {
  tourPending: false,
  tourActive: false,
  userId: "checklist-map-user",
  sourcesCount: 0,
  hasSearched: false,
  hasExportedOrReviewed: false,
  onOpen: vi.fn(),
  onCreate: vi.fn(async () => undefined),
  onDelete: vi.fn(async () => undefined),
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.querySelectorAll("#paste-title-probe").forEach((el) => el.remove());
});

it("row 2 focuses the paste title input when an add-source editor is present", () => {
  const probe = document.createElement("input");
  probe.id = "paste-title-probe";
  const title = document.createElement("input");
  title.id = "paste-title";
  title.setAttribute("aria-label", "workspace paste title");
  probe.appendChild(title);
  document.body.appendChild(probe);

  render(<NotebookPicker notebooks={[]} {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: /add a source/i }));
  expect(document.activeElement).toBe(title);
  expect(document.activeElement?.id).not.toBe("new-notebook-name");
});

it("row 2 on landing focuses the first notebook Open button, not the name field", () => {
  render(<NotebookPicker notebooks={NOTEBOOKS} {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: /add a source/i }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open Biology" }));
  expect(document.activeElement?.id).not.toBe("new-notebook-name");
});

it("row 2 with no notebooks focuses the demo path, not the name field", () => {
  render(<NotebookPicker notebooks={[]} {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: /add a source/i }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /open a demo notebook/i }));
  expect(document.activeElement?.id).not.toBe("new-notebook-name");
});

it("row 1 still focuses the notebook name field", () => {
  render(<NotebookPicker notebooks={NOTEBOOKS} {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: /create or open a notebook/i }));
  expect(document.activeElement?.id).toBe("new-notebook-name");
});
