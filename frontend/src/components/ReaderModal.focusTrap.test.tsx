// @vitest-environment jsdom
// Round 17 item 1: ReaderModal traps Tab like FirstRunTour (capture-phase
// cycling within the dialog + Escape) and inerts the background while open.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn(), createNote: vi.fn() };
});

afterEach(() => cleanup());
beforeEach(() => {
  vi.mocked(api.getSource).mockResolvedValue({
    id: "s1", notebook_id: "n1", kind: "pdf", title: "Trapped", tags: [],
    meta: { page_count: 3 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 3,
    pages: [
      { number: 1, text: "Page one" },
      { number: 2, text: "Page two" },
      { number: 3, text: "Page three" },
    ],
    chunks: [],
    important_passages: [{ text: "Key line.", score: 0.9, chunk_seq: 0, pages: [1] }],
  } satisfies SourceDetail);
});

function dialogButtons(): HTMLButtonElement[] {
  const dialog = screen.getByRole("dialog");
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
}

it("cycles Tab within the dialog and never strands focus on BODY or behind", async () => {
  const onClose = vi.fn();
  render(
    <div>
      <main>
        <button type="button">behind</button>
      </main>
      <ReaderModal sourceId="s1" onClose={onClose} />
    </div>,
  );
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  const buttons = dialogButtons();
  expect(buttons.length).toBeGreaterThan(1);

  // Forward wrap: last → first.
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  last.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(first);

  // Backward wrap: first → last.
  first.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);

  // Focus outside the dialog is pulled inside, never left on BODY/behind.
  screen.getByRole("button", { name: "behind" }).focus();
  fireEvent.keyDown(document, { key: "Tab" });
  const dialog = screen.getByRole("dialog");
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
});

it("inerts the background landmarks while open and removes inert on close", async () => {
  const onClose = vi.fn();
  const { rerender } = render(
    <div>
      <main data-testid="bg">
        <button type="button">behind</button>
      </main>
      <ReaderModal sourceId="s1" onClose={onClose} />
    </div>,
  );
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  expect(screen.getByTestId("bg").hasAttribute("inert")).toBe(true);

  rerender(
    <div>
      <main data-testid="bg">
        <button type="button">behind</button>
      </main>
      <ReaderModal sourceId={null} onClose={onClose} />
    </div>,
  );
  expect(screen.getByTestId("bg").hasAttribute("inert")).toBe(false);
});

it("still dismisses on Escape", async () => {
  const onClose = vi.fn();
  render(<ReaderModal sourceId="s1" onClose={onClose} />);
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});
