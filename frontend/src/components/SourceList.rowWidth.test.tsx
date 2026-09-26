// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "paste",
  title: "My Notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

describe("round8 item3 row width", () => {
  it("gives the title block room: tight gaps, compact badge and actions", () => {
    const { container } = render(
      <SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );
    const title = screen.getByText("My Notes");
    const row = title.closest("div.flex") as HTMLElement;
    expect(row).toBeTruthy();
    // Tighter horizontal rhythm leaves more room for the title (round 19:
    // gap-1.5 + px-2 so long titles reach two lines instead of truncating).
    expect(row.className).toMatch(/gap-1\.5/);
    expect(row.className).not.toMatch(/gap-3/);
    // Title block stays the flexible growing cell.
    const titleCell = title.closest("div.min-w-0") as HTMLElement;
    expect(titleCell.className).toMatch(/flex-1/);
    // Compact kind badge + compact inline actions shrink the fixed footprint.
    const badge = container.querySelector("span.rounded") as HTMLElement;
    expect(badge.className).toMatch(/px-1\b/);
    const read = screen.getByRole("button", { name: "Read My Notes" });
    expect(read.className).toMatch(/px-1\.5/);
  });

  it("keeps desktop inline actions and the mobile toggle", () => {
    const { container } = render(
      <SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );
    const inline = container.querySelector('[data-testid="source-delete-inline"]') as HTMLElement;
    expect(inline.className).toMatch(/sm:inline-flex/);
    expect(screen.getByRole("button", { name: /Show Source actions/i }).className).toMatch(/sm:hidden/);
  });
});
