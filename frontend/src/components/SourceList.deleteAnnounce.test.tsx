// @vitest-environment jsdom
// Round 13 item 2: after a source delete, focus must land on a sensible
// workspace control (mirroring NotebookPicker's pendingFocus repair) with a
// non-empty announcement — never strand on <body>.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const makeSource = (id: string, title: string): SourceSummary => ({
  id,
  notebook_id: "notebook-1",
  kind: "pdf",
  title,
  tags: [],
  meta: { page_count: 1 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 2,
});

function Harness() {
  const [sources, setSources] = useState([makeSource("s1", "Alpha notes"), makeSource("s2", "Beta notes")]);
  return (
    <SourceList
      sources={sources}
      onOpen={vi.fn()}
      onDelete={async (id) => {
        await act(async () => {
          setSources((prev) => prev.filter((s) => s.id !== id));
        });
      }}
    />
  );
}

describe("round13 item2 source delete focus", () => {
  it("repairs focus to a sensible control and announces the delete", async () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Show Source actions for Alpha notes/i }));
    fireEvent.click(container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Delete Alpha notes"]')!);
    const confirm = container.querySelector('[data-testid="swipe-row-actions"] button[aria-label="Confirm delete Alpha notes"]') as HTMLButtonElement;
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByText("Alpha notes")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    const status = screen.getByRole("status", { name: "Source announcement" });
    expect(status.textContent && status.textContent.length).toBeGreaterThan(0);
    expect(status.textContent).toMatch(/Alpha notes/i);
  });
});
