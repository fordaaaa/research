// @vitest-environment jsdom
// Round 15 item 1: title-collision saves show an inline note in the Saved region.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("suffixed save shows the collision note in the Saved region", async () => {
  const onPaste = vi.fn().mockResolvedValue(undefined);
  render(
    <UploadZone
      onUpload={vi.fn().mockResolvedValue([])}
      onPaste={onPaste}
      existingTitles={["Name"]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Name" } });
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Some body text here" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
  expect(screen.getByText(/already had 'Name' — saved as 'Name \(2\)'/i)).toBeTruthy();
});

it("clean save shows no collision note", async () => {
  const onPaste = vi.fn().mockResolvedValue(undefined);
  render(
    <UploadZone
      onUpload={vi.fn().mockResolvedValue([])}
      onPaste={onPaste}
      existingTitles={["Other"]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Fresh" } });
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Some body text here" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  expect(await screen.findByText(/saved ✓/i)).toBeTruthy();
  expect(screen.queryByText(/already had/i)).toBeNull();
});
