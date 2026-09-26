// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

function openPaste() {
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
}

it("shows a live derived-title preview while the title is empty", () => {
  openPaste();
  expect(screen.queryByText(/will save as:/i)).toBeNull();
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Mitochondria produce energy for the cell through respiration daily" },
  });
  const preview = screen.getByText(/will save as:/i);
  expect(preview.textContent).toBe("Will save as: Mitochondria produce energy for the cell…");
  // Updates as more text is typed.
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Chloroplasts capture sunlight in green leaves every single morning" },
  });
  expect(screen.getByText(/will save as:/i).textContent).toBe(
    "Will save as: Chloroplasts capture sunlight in green leaves…",
  );
});

it("hides the preview once an explicit title is typed", () => {
  openPaste();
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Mitochondria produce energy for the cell" },
  });
  expect(screen.getByText(/will save as:/i)).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "My title" } });
  expect(screen.queryByText(/will save as:/i)).toBeNull();
});
