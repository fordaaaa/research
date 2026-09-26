// @vitest-environment jsdom
// Round 16 item 6: when the "already have this exact text" warn appears,
// focus must move into the warn region (or the Save-anyway button) so
// keyboard users don't tab past it.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("moves focus into the duplicate warn on appear", async () => {
  const onPaste = vi.fn().mockResolvedValue({
    saved: false,
    duplicate_of: { id: "s1", title: "Cells" },
  });
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={onPaste} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  const body = screen.getByLabelText(/paste body/i);
  fireEvent.change(body, { target: { value: "Cells divide in mitosis daily" } });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  const warn = await screen.findByRole("alert");
  expect(warn.textContent).toMatch(/already have this exact text/i);
  const saveAnyway = screen.getByRole("button", { name: /save anyway/i });
  expect([warn, saveAnyway]).toContain(document.activeElement);
});
