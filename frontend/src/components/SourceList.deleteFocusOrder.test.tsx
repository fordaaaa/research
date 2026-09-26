// @vitest-environment jsdom
// Round 22 item 7 (FAILING first): post-delete focus order is next remaining
// Read button → paste entry → H2. Deleting the middle row must land on the
// NEXT row's Read (not the first Read, not H2).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function Harness({ initial }: { initial: SourceSummary[] }) {
  const [sources, setSources] = useState(initial);
  // NOTE: no explicit act() around the state update — nesting await act()
  // inside the async onDelete (as the round13 harness does) poisons React's
  // act scope and empties every later render in the same file. RTL's
  // fireEvent/waitFor flush these updates safely.
  return (
    <SourceList
      sources={sources}
      onOpen={vi.fn()}
      onDelete={async (id) => {
        setSources((prev) => prev.filter((s) => s.id !== id));
      }}
    />
  );
}

function confirmDelete(title: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Delete ${title}$`, "i") }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Confirm delete ${title}`, "i") }));
}

describe("round22 item7 delete focus order", () => {
  it("delete middle row focuses the NEXT remaining Read button", async () => {
    render(
      <Harness
        initial={[makeSource("s1", "Alpha notes"), makeSource("s2", "Beta notes"), makeSource("s3", "Gamma notes")]}
      />,
    );
    confirmDelete("Beta notes");
    await waitFor(() => expect(screen.queryByText("Beta notes")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read Gamma notes" })),
    );
  });

  it("delete last row focuses the new last Read button", async () => {
    render(
      <Harness initial={[makeSource("s1", "Alpha notes"), makeSource("s2", "Beta notes")]} />,
    );
    confirmDelete("Beta notes");
    await waitFor(() => expect(screen.queryByText("Beta notes")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read Alpha notes" })),
    );
  });

  it("delete the only row falls back to the paste entry, then H2", async () => {
    const paste = document.createElement("input");
    paste.id = "paste-title";
    paste.setAttribute("aria-label", "workspace paste title");
    document.body.appendChild(paste);
    try {
      render(<Harness initial={[makeSource("s1", "Alpha notes")]} />);
      confirmDelete("Alpha notes");
      await waitFor(() => expect(screen.queryByText("Alpha notes")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(paste));
    } finally {
      paste.remove();
    }
  });
});
