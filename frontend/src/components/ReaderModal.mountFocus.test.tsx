// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.mocked(api.createNote).mockReset();
  vi.mocked(api.getSource).mockResolvedValue({
    id: "s1", notebook_id: "n1", kind: "pdf", title: "Focus me", tags: [],
    meta: { page_count: 1 }, created_at: "2026-01-01T00:00:00Z", chunk_count: 1,
    pages: [{ number: 1, text: "Body text" }], chunks: [],
  } satisfies SourceDetail);
});

describe("round8 item2 reader focus", () => {
  it("moves focus to the close button on mount and returns focus on Escape close", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open reader";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = vi.fn();
    const { unmount } = render(<ReaderModal sourceId="s1" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByText("Body text")).toBeTruthy());

    // Round-12: the focus target is the close button itself (actionable,
    // visibly focused); the container is no longer the target.
    const close = screen.getByRole("button", { name: /close reader/i });
    expect(document.activeElement).toBe(close);
    expect(document.activeElement).not.toBe(dialog);
    // The heading still labels the dialog for screen readers.
    expect(screen.getByRole("heading", { name: "Focus me" })).toBeTruthy();
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Parent unmounts the modal on close: focus must return to the trigger.
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
