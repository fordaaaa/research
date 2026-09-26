// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("disables Save source and shows a spinner while the paste promise is pending", () => {
  let resolvePaste!: () => void;
  const onPaste = vi.fn(() => new Promise<void>((resolve) => { resolvePaste = resolve; }));
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={onPaste} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Some pasted body text" },
  });
  const save = screen.getByRole("button", { name: /save source|saving/i });
  fireEvent.click(save);
  const busy = screen.getByRole("button", { name: /saving/i });
  expect(busy.hasAttribute("disabled")).toBe(true);
  expect(busy.textContent).toMatch(/saving/i);
  resolvePaste();
});
