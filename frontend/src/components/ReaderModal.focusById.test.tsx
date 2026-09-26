// @vitest-environment jsdom
// Round 19 item 3 (FAILING first): the opener element often unmounts during
// a read (list refresh), so restoring the saved element falls back to H2 and
// never the Read button. At open the reader records source id + title; on
// close it re-queries button[aria-label="Read {title}"] (or data-source-id)
// and focuses it when present — H2 only when no match exists.
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

const CELLS = {
  id: "source-1", notebook_id: "notebook-1", kind: "paste" as const, title: "Cells",
  tags: [], meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
};

const MITOSIS = {
  id: "source-2", notebook_id: "notebook-1", kind: "pdf" as const, title: "Mitosis",
  tags: [], meta: { page_count: 1 }, created_at: "2026-01-02T00:00:00Z", chunk_count: 1,
};

beforeEach(() => {
  vi.mocked(api.getSource).mockResolvedValue({
    ...CELLS, pages: [{ number: 1, text: "Page one" }], chunks: [],
  } satisfies SourceDetail);
});

afterEach(() => cleanup());

function Harness({ mode }: { mode: "refresh-same" | "no-match" }) {
  const [readingId, setReadingId] = useState<string | null>(null);
  // A list refresh remounts every row (fresh elements, same source id +
  // title): the saved opener node is disconnected, but an equivalent Read
  // button is present and must receive focus.
  const [epoch, setEpoch] = useState(0);
  const sources = mode === "no-match" && readingId === null && epoch > 0 ? [MITOSIS] : [CELLS];
  return (
    <>
      <SourceList
        key={epoch}
        sources={sources as never}
        onOpen={(id: string) => setReadingId(id)}
        onDelete={async () => {}}
      />
      <ReaderModal
        sourceId={readingId}
        onClose={() => {
          setReadingId(null);
          setEpoch((n) => n + 1);
        }}
      />
    </>
  );
}

it("close after list refresh focuses the matching Read button (not H2)", async () => {
  render(<Harness mode="refresh-same" />);
  const opener = screen.getByRole("button", { name: "Read Cells" });
  opener.focus();
  fireEvent.click(opener);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Read Cells"),
  );
});

it("no matching Read button still falls back to the Sources H2", async () => {
  render(<Harness mode="no-match" />);
  const opener = screen.getByRole("button", { name: "Read Cells" });
  opener.focus();
  fireEvent.click(opener);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
});
