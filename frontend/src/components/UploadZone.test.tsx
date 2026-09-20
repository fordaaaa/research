// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

function renderZone(overrides: Partial<ComponentProps<typeof UploadZone>> = {}) {
  const onUpload = vi.fn().mockResolvedValue([]);
  const onPaste = vi.fn().mockResolvedValue(undefined);
  render(<UploadZone onUpload={onUpload} onPaste={onPaste} {...overrides} />);
  return { onUpload, onPaste };
}

describe("UploadZone accessibility and mobile actions", () => {
  it("exposes keyboard-accessible file upload and a labelled picker", async () => {
    const { onUpload } = renderZone();
    const upload = screen.getByRole("button", { name: /upload files/i });
    const input = screen.getByLabelText(/choose files/i) as HTMLInputElement;
    expect(upload.className).toMatch(/min-h-12/);
    expect(input.type).toBe("file");
    fireEvent.keyDown(upload, { key: "Enter" });
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([file]));
  });

  it("offers paste as a clear, touch-sized action and reports paste errors", async () => {
    const onPaste = vi.fn().mockRejectedValue(new Error("paste failed"));
    renderZone({ onPaste });
    const paste = screen.getByRole("button", { name: /paste text instead/i });
    expect(paste.className).toMatch(/min-h-12/);
    fireEvent.click(paste);
    fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), { target: { value: "A note" } });
    fireEvent.click(screen.getByRole("button", { name: /save source/i }));
    await waitFor(() => expect(screen.getByText(/paste: paste failed/i)).toBeTruthy());
  });

  it("labels the paste editor for screen readers", () => {
    renderZone();
    fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
    expect(screen.getByLabelText(/paste title/i)).toBeTruthy();
    expect(screen.getByLabelText(/paste body/i)).toBeTruthy();
  });
});
