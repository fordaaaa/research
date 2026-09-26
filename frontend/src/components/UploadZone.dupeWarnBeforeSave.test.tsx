// @vitest-environment jsdom
// Round 11 item 1: warn-BEFORE-save for paste duplicates.
// New contract: HTTP 200 + {saved:false, duplicate_of} means NOTHING was
// persisted -> warn inline WITHOUT refreshing counts. Save-anyway resends
// {force:true} -> saved -> clear + refresh. Cancel keeps the draft.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

type OnPaste = ComponentProps<typeof UploadZone>["onPaste"];

afterEach(() => cleanup());

function openPaste(onPaste: OnPaste, text = "Cells divide in mitosis daily") {
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={onPaste} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: text },
  });
}

describe("round11 item1 warn-before-save", () => {
  it("unsaved warn: saved:false shows the inline warn and keeps the draft open", async () => {
    const onPaste = vi.fn().mockResolvedValue({ saved: false, duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    expect(await screen.findByText(/existing note/i)).toBeTruthy();
    expect(onPaste).toHaveBeenCalledTimes(1);
    // Draft is untouched (warn-before-save: nothing persisted, form stays).
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe(
      "Cells divide in mitosis daily",
    );
    // No success state on the unsaved path.
    expect(screen.queryByText(/saved ✓/i)).toBeNull();
  });

  it("force-saves-once: Save anyway resends force:true and lands in saved state", async () => {
    const onPaste = vi.fn()
      .mockResolvedValueOnce({ saved: false, duplicate_of: { id: "d1", title: "Existing note" } })
      .mockResolvedValueOnce({ saved: true });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));
    await waitFor(() => expect(onPaste).toHaveBeenCalledTimes(2));
    expect(onPaste.mock.calls[1][2]).toMatchObject({ force: true });
    // After the forced save the warn is gone and the saved state shows.
    await waitFor(() => expect(screen.queryByText(/you already have this exact text/i)).toBeNull());
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
  });

  it("cancel-keeps-draft: Cancel clears the warn with no second save", async () => {
    const onPaste = vi.fn().mockResolvedValue({ saved: false, duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByText(/you already have this exact text/i)).toBeNull());
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe(
      "Cells divide in mitosis daily",
    );
  });

  it("legacy path: saved:true + hint clears and confirms (no warn for just-saved text)", async () => {
    // Round 22 item 6: a real save (even with a legacy duplicate_of echo
    // after a 201) clears the draft and shows Saved — the warn must never
    // appear for just-saved text. Only saved:false warns.
    const onPaste = vi.fn().mockResolvedValue({ saved: true, duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
    expect(screen.queryByText(/you already have this exact text/i)).toBeNull();
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe("");
    expect(onPaste).toHaveBeenCalledTimes(1);
  });
});
