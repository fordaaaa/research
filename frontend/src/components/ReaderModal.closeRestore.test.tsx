// @vitest-environment jsdom
// Round 13 item 7: the ×-button-click close path must restore focus to the
// trigger, exactly like the proven Escape path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { SourceDetail } from "../api";
import * as api from "../api";
import ReaderModal from "./ReaderModal";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, getSource: vi.fn(), createNote: vi.fn() };
});

afterEach(() => cleanup());
beforeEach(() => {
  vi.mocked(api.createNote).mockReset();
  vi.mocked(api.getSource).mockResolvedValue({
    id: "s1", notebook_id: "n1", kind: "pdf", title: "Close me", tags: [],
    meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
    pages: [{ number: 1, text: "Body text" }], chunks: [],
  } satisfies SourceDetail);
});

function Wrapper() {
  const [id, setId] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setId("s1")}>open reader</button>
      <ReaderModal sourceId={id} onClose={() => setId(null)} />
    </>
  );
}

describe("round13 item7 reader close-button focus", () => {
  it("clicking × restores focus to the trigger", async () => {
    render(<Wrapper />);
    const trigger = screen.getByRole("button", { name: "open reader" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByText("Body text")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close reader/i }));
    fireEvent.click(screen.getByRole("button", { name: /close reader/i }));
    await act(async () => {});
    expect(document.activeElement).toBe(trigger);
  });
});
