// @vitest-environment jsdom
// Round 11 item 5: the landing page must expose a labeled landmark wrapping
// the landing actions at mobile width (390px), with no visual change.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("landing exposes a labeled navigation landmark at 390px", () => {
  vi.stubGlobal("innerWidth", 390);
  render(
    <NotebookPicker
      notebooks={[{ id: "n1", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  const nav = screen.getByRole("navigation", { name: /notebook actions/i });
  expect(nav.tagName).toBe("NAV");
  // The create form and demo entry point live inside the landmark.
  expect(nav.contains(screen.getByPlaceholderText(/new notebook name/i))).toBe(true);
  expect(nav.contains(screen.getByRole("button", { name: /demo notebook/i }))).toBe(true);
});
