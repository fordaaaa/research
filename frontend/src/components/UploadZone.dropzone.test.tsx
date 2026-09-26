// @vitest-environment jsdom
// Item 7 (FAILING first): regression lock for the bare-DIV focus incident.
// The dropzone is a NAMED button ("Upload files") in natural tab order —
// never a bare div — and the reveal/create focus chain must never land on
// it (title input first, labeled add-sources region as the only fallback).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

afterEach(() => cleanup());

it("the dropzone is a named button, not a bare div, and never takes reveal focus", async () => {
  const { container } = render(
    <UploadZone onUpload={vi.fn().mockResolvedValue([])} onPaste={vi.fn().mockResolvedValue(undefined)} />,
  );
  const dropzone = screen.getByTestId("dropzone");
  // Not a bare DIV: a real button with an accessible name.
  expect(dropzone.tagName).toBe("BUTTON");
  expect(dropzone.getAttribute("aria-label")).toBe("Upload files");
  // Natural tab order — no explicit tabindex hijack (positive or -1).
  expect(dropzone.getAttribute("tabindex")).toBeNull();
  // The reveal chain targets the paste title or the labeled region;
  // the dropzone is never a programmatic focus target.
  expect(container.querySelector("[data-testid='dropzone']")).toBe(dropzone);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Title")));
  expect(document.activeElement).not.toBe(dropzone);
});
