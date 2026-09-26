// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const notesApiMocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  getNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...notesApiMocks };
});

import NotesPanel from "./NotesPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("empty note view offers a New note CTA", async () => {
  notesApiMocks.listNotes.mockResolvedValue([]);
  render(<NotesPanel notebookId="nb-1" />);
  expect(await screen.findByText(/choose a note/i)).toBeTruthy();
  const cta = await screen.findByRole("button", { name: /create your first note/i });
  expect(cta.textContent).toMatch(/new note/i);
});
