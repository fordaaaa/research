// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

describe("round7 item3 actions discoverability", () => {
  it("shows row Delete inline on sm+ without opening the toggle", () => {
    const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />);
    const inline = container.querySelector('[data-testid="source-delete-inline"]') as HTMLElement;
    expect(inline).toBeTruthy();
    expect(inline.className).toMatch(/hidden/);
    expect(inline.className).toMatch(/sm:inline-flex/);
    expect(inline.className).toContain("min-h-11");
    expect(inline.getAttribute("aria-label")).toBe("Delete Cell biology notes");
    // Present without touching the mobile toggle.
    expect(screen.getByRole("button", { name: /Show Source actions/i })).toBeTruthy();
  });

  it("keeps the mobile toggle for small screens", () => {
    render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /Show Source actions/i });
    expect(toggle.className).toMatch(/sm:hidden/);
  });
});
