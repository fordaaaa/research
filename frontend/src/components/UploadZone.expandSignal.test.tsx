// @vitest-environment jsdom
// Round 25 item 2 (FAILING first): the "Paste it as a source →" start-here
// link must do more than scroll — it expands the paste editor, moves focus
// to the paste title input, and announces "Paste form open" politely.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("external expand signal opens the editor, focuses the title, and announces", () => {
  const { rerender } = render(<UploadZone onUpload={vi.fn()} onPaste={vi.fn()} expandSignal={0} />);
  expect(screen.queryByPlaceholderText("Title")).toBeNull();
  rerender(<UploadZone onUpload={vi.fn()} onPaste={vi.fn()} expandSignal={1} />);
  expect(screen.getByPlaceholderText("Title")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByPlaceholderText("Title"));
  expect(screen.getByRole("status", { name: "Paste form announcement" }).textContent).toMatch(
    /paste form open/i,
  );
});

it("same signal twice does not churn; manual toggle still works", () => {
  const { rerender } = render(<UploadZone onUpload={vi.fn()} onPaste={vi.fn()} expandSignal={0} />);
  rerender(<UploadZone onUpload={vi.fn()} onPaste={vi.fn()} expandSignal={0} />);
  expect(screen.queryByPlaceholderText("Title")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  expect(screen.getByPlaceholderText("Title")).toBeTruthy();
});
