// @vitest-environment jsdom
// Round 11 item 6: after a successful paste save the editor stays open with
// an inline "Saved ✓" state (bulk-paste flow); a second paste works without
// reopening. File-upload collapse behavior is untouched.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

type OnPaste = ComponentProps<typeof UploadZone>["onPaste"];

afterEach(() => cleanup());

function openPaste(onPaste: OnPaste) {
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={onPaste} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "First pasted note body" },
  });
}

describe("round11 item6 editor stays open", () => {
  it("successful save shows Saved ✓ and keeps the form open with cleared fields", async () => {
    const onPaste = vi.fn().mockResolvedValue({ saved: true });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
    // Form stays open: the editor is still there, draft cleared for the next paste.
    expect(screen.getByPlaceholderText("Paste your text here…")).toBeTruthy();
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe("");
  });

  it("second paste works without reopening the editor", async () => {
    const onPaste = vi.fn().mockResolvedValue({ saved: true });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/saved ✓/i);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
      target: { value: "Second pasted note body" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await waitFor(() => expect(onPaste).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
  });
});
