// @vitest-environment jsdom
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
    target: { value: "Cells divide in mitosis daily" },
  });
}

describe("round10 item5 duplicate-paste warning", () => {
  it("warn renders with the existing title when duplicate_of is present", async () => {
    const onPaste = vi.fn().mockResolvedValue({ duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await waitFor(() => expect(onPaste).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/existing note/i)).toBeTruthy();
    expect(screen.getByText(/you already have this exact text/i)).toBeTruthy();
  });

  it("Save-anyway proceeds with a forced save", async () => {
    const onPaste = vi.fn().mockResolvedValue({ duplicate_of: { id: "d1", title: "Existing note" } });
    onPaste.mockResolvedValueOnce({ duplicate_of: { id: "d1", title: "Existing note" } }).mockResolvedValueOnce({});
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));
    await waitFor(() => expect(onPaste).toHaveBeenCalledTimes(2));
    expect(onPaste.mock.calls[1][2]).toMatchObject({ force: true });
  });

  it("Cancel aborts without a second save and keeps the draft", async () => {
    const onPaste = vi.fn().mockResolvedValue({ duplicate_of: { id: "d1", title: "Existing note" } });
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await screen.findByText(/you already have this exact text/i);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText(/you already have this exact text/i)).toBeNull());
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect((screen.getByPlaceholderText("Paste your text here…") as HTMLTextAreaElement).value).toBe(
      "Cells divide in mitosis daily",
    );
  });

  it("old shape without duplicate_of saves normally with no warning", async () => {
    const onPaste = vi.fn().mockResolvedValue(undefined);
    openPaste(onPaste);
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await waitFor(() => expect(onPaste).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/you already have this exact text/i)).toBeNull();
  });
});
