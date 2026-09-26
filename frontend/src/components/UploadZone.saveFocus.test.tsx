// @vitest-environment jsdom
// Round 17 item 6 (paste): the busy-disable save yanked focus to BODY — on
// save completion focus moves to the Saved status region instead.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("moves focus to the Saved status region after a paste save", async () => {
  const onPaste = vi.fn().mockResolvedValue({ saved: true });
  render(<UploadZone onUpload={vi.fn()} onPaste={onPaste} existingTitles={[]} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByLabelText(/paste body/i), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^save source$/i }));
  const status = await screen.findByText(/saved ✓/i);
  expect(status.getAttribute("role")).toBe("status");
  await waitFor(() => expect(document.activeElement).toBe(status));
  expect(document.activeElement).not.toBe(document.body);
});
