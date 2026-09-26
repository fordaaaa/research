// @vitest-environment jsdom
// Round 22 item 6 (FAILING first): a successful save (201, saved:true) must
// clear the title+text draft, show Saved ✓, and NEVER show the self-dupe
// warn for the just-saved text — even when the backend echoes duplicate_of
// (legacy warn-after-save). Only saved:false (nothing persisted) warns and
// keeps the draft.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

type OnPaste = ComponentProps<typeof UploadZone>["onPaste"];

afterEach(() => cleanup());

function openPaste(onPaste: OnPaste, text = "Cells divide in mitosis daily") {
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={onPaste} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Mitosis" } });
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), { target: { value: text } });
}

describe("round22 item6 draft clear on success", () => {
  it("plain 201 save clears title+text, shows Saved, no warn", async () => {
    const onPaste = vi.fn().mockResolvedValue({ saved: true });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
    expect((screen.getByPlaceholderText("Title") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText(/you already have this exact text/i)).toBeNull();
  });

  it("saved:true WITH duplicate_of still clears and never warns", async () => {
    const onPaste = vi
      .fn()
      .mockResolvedValue({ saved: true, duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe(""),
    );
    expect((screen.getByPlaceholderText("Title") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/you already have this exact text/i)).toBeNull();
  });

  it("saved:false keeps the draft and warns (nothing persisted)", async () => {
    const onPaste = vi
      .fn()
      .mockResolvedValue({ saved: false, duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe(
      "Cells divide in mitosis daily",
    );
    expect(screen.queryByText(/saved ✓/i)).toBeNull();
  });
});
