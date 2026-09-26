// @vitest-environment jsdom
// Round 16 item 7: closing the reader restores focus to the invoking Read
// button when still connected; when the opener unmounted (list refresh),
// focus falls back to the Sources H2.
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";
import SourceList from "./SourceList";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn() };
});

const SOURCES = [
  {
    id: "source-1", notebook_id: "notebook-1", kind: "paste", title: "Cells",
    tags: [], meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
  },
];

const OTHER_SOURCES = [
  {
    id: "source-2", notebook_id: "notebook-1", kind: "pdf", title: "Mitosis",
    tags: [], meta: { page_count: 1 }, created_at: "2026-01-02T00:00:00Z", chunk_count: 1,
  },
];

beforeEach(() => {
  vi.mocked(api.getSource).mockResolvedValue({
    id: "source-1", notebook_id: "notebook-1", kind: "paste", title: "Cells",
    tags: [], meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
    pages: [{ number: 1, text: "Page one" }], chunks: [],
  } satisfies SourceDetail);
});

afterEach(() => cleanup());

function Harness({ dropOpenerOnClose = false }: { dropOpenerOnClose?: boolean }) {
  const [readingId, setReadingId] = useState<string | null>(null);
  // A list refresh during the read: the Sources section (and its H2) stays
  // mounted, but the invoking Read row unmounts.
  const [sources, setSources] = useState<never[]>(SOURCES as never[]);
  return (
    <>
      <SourceList
        sources={sources as never}
        onOpen={(id: string) => setReadingId(id)}
        onDelete={async () => {}}
      />
      <ReaderModal
        sourceId={readingId}
        onClose={() => {
          setReadingId(null);
          if (dropOpenerOnClose) setSources(OTHER_SOURCES as never[]);
        }}
      />
    </>
  );
}

it("Escape with a connected opener restores focus to that Read button", async () => {
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Read Cells" });
  opener.focus();
  fireEvent.click(opener);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Read Cells"),
  );
});

it("opener unmounted during read falls back to the Sources H2", async () => {
  render(<Harness dropOpenerOnClose />);
  const opener = screen.getByRole("button", { name: "Read Cells" });
  opener.focus();
  fireEvent.click(opener);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
});
