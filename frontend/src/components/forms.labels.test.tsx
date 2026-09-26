// @vitest-environment jsdom
// Round 16 item 2: every text input has a real <label> (getByLabel works).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("notebook-name input has a real label", () => {
  render(
    <NotebookPicker notebooks={[]} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByLabelText(/notebook name/i)).toBeTruthy();
});

it("paste Title/body inputs have real labels", () => {
  render(<UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  expect(screen.getByLabelText(/paste title/i)).toBeTruthy();
  expect(screen.getByLabelText(/paste body/i)).toBeTruthy();
});
