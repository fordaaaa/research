// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  getNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});

import NotesPanel from "./NotesPanel";
import { NoteConflictError } from "../api";

const note = {
  id: "a1b2c3d4e5f6",
  notebook_id: "111111111111",
  title: "Lecture notes",
  body: "ATP stores usable energy.",
  tags: [],
  citations: [],
  rev: 1,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotesPanel", () => {
  it("creates a real notebook note from the empty state", async () => {
    apiMocks.listNotes.mockResolvedValue([]);
    apiMocks.createNote.mockResolvedValue(note);
    apiMocks.getNote.mockResolvedValue(note);

    render(<NotesPanel notebookId="111111111111" autosaveMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /new note/i }));

    await waitFor(() =>
      expect(apiMocks.createNote).toHaveBeenCalledWith("111111111111", {
        title: "Untitled note",
        body: "",
      }),
    );
    expect(await screen.findByLabelText("Note body")).toBeTruthy();
  });

  it("autosaves Markdown with optimistic revision protection", async () => {
    apiMocks.listNotes.mockResolvedValue([note]);
    apiMocks.getNote.mockResolvedValue(note);
    apiMocks.updateNote.mockResolvedValue({ ...note, body: "ATP powers cells.", rev: 2 });

    render(<NotesPanel notebookId="111111111111" autosaveMs={0} />);
    const body = await screen.findByLabelText("Note body");
    fireEvent.change(body, { target: { value: "ATP powers cells." } });

    await waitFor(() =>
      expect(apiMocks.updateNote).toHaveBeenCalledWith(
        "111111111111",
        note.id,
        expect.objectContaining({ body: "ATP powers cells.", base_rev: 1 }),
      ),
    );
    expect(await screen.findByText(/^Saved$/)).toBeTruthy();
  });

  it("keeps local edits when the server reports a newer revision", async () => {
    const serverNote = { ...note, body: "Server-side edit.", rev: 2 };
    apiMocks.listNotes.mockResolvedValue([note]);
    apiMocks.getNote.mockResolvedValue(note);
    apiMocks.updateNote.mockRejectedValue(new NoteConflictError(serverNote));

    render(<NotesPanel notebookId="111111111111" autosaveMs={0} />);
    const body = await screen.findByLabelText("Note body");
    fireEvent.change(body, { target: { value: "My unsaved local edit." } });

    await waitFor(() => expect(apiMocks.updateNote).toHaveBeenCalled());
    const kept = (await screen.findByLabelText("Note body")) as HTMLTextAreaElement;
    expect(kept.value).toBe("My unsaved local edit.");
    expect(screen.getByText(/newer version/i)).toBeTruthy();
  });

  it("ignores a stale note response when switching notes quickly", async () => {
    const second = { ...note, id: "b2c3d4e5f6a7", title: "Second note", body: "Second body." };
    let resolveFirst!: (value: typeof note) => void;
    const firstPromise = new Promise<typeof note>((resolve) => { resolveFirst = resolve; });
    apiMocks.listNotes.mockResolvedValue([note, second]);
    apiMocks.getNote.mockImplementation((_notebookId: string, id: string) =>
      id === second.id ? Promise.resolve(second) : firstPromise,
    );

    render(<NotesPanel notebookId="111111111111" autosaveMs={60_000} />);
    await screen.findByText("Lecture notes");
    const buttons = await screen.findAllByRole("button", { name: /lecture notes|second note/i });
    const firstButton = buttons.find((button) => button.textContent === "Lecture notes")!;
    const secondButton = buttons.find((button) => button.textContent === "Second note")!;
    fireEvent.click(firstButton);
    fireEvent.click(secondButton);
    await waitFor(() => {
      const body = screen.getByLabelText("Note body") as HTMLTextAreaElement;
      expect(body.value).toBe("Second body.");
    });
    resolveFirst(note);
    await waitFor(() => expect(apiMocks.getNote).toHaveBeenCalledTimes(3));
    const body = (await screen.findByLabelText("Note body")) as HTMLTextAreaElement;
    expect(body.value).toBe("Second body.");
  });
});
