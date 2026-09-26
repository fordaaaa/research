// @vitest-environment jsdom
// Round 18 item 6: opening "Paste text instead" must move focus into the
// paste title input (not leave it on the toggle).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("moves focus into the paste title input on expand", () => {
  render(<UploadZone onUpload={vi.fn()} onPaste={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  expect(document.activeElement).toBe(screen.getByPlaceholderText("Title"));
});
