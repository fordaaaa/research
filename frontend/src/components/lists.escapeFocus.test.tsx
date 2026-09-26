// @vitest-environment jsdom
// Round 24 item 5 (FAILING first): Escape disarms the delete confirm but the
// focus destination is unproven live. Pin focus explicitly to the arm
// (Delete) button on Escape-disarm — SourceList + NotebookPicker.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

const SOURCE: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

const NOTEBOOKS = [{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }];

it("SourceList: Escape pins focus to the Delete arm button", () => {
  render(<SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));
  const confirm = screen.getByRole("button", { name: /confirm delete cell biology notes/i });
  confirm.focus();
  fireEvent.keyDown(confirm, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Delete Cell biology notes" })).toBeTruthy();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Delete Cell biology notes");
});

it("SourceList: Escape from elsewhere still pins focus to the Delete arm", () => {
  render(<SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));
  expect(screen.getByRole("button", { name: /confirm delete/i })).toBeTruthy();
  // Focus moves away (search field, body, anywhere) then Escape disarms.
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.body.focus();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Delete Cell biology notes" })).toBeTruthy();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Delete Cell biology notes");
});

it("NotebookPicker: Escape pins focus to the Delete arm button", () => {
  render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  const confirm = screen.getByRole("button", { name: /confirm delete biology/i });
  confirm.focus();
  fireEvent.keyDown(confirm, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Delete Biology" })).toBeTruthy();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Delete Biology");
});
