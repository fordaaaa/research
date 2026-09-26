// @vitest-environment jsdom
// Round 19 item 2 (FAILING first): long titles must use available width —
// up to 2 lines via line-clamp instead of single-line truncate, with a
// compact badge/meta footprint and tighter action gaps. Row height stays
// sane (clamped, flexible cell intact).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Mitosis notes on cell division stages and checkpoint controls",
  tags: [],
  meta: { page_count: 4 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 9,
};

it("lets the title wrap to two lines instead of single-line truncate", () => {
  render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />);
  const title = screen.getByText("Mitosis notes on cell division stages and checkpoint controls");
  expect(title.tagName).toBe("BUTTON");
  expect(title.className).toMatch(/line-clamp-2/);
  expect(title.className).not.toMatch(/truncate/);
  const titleCell = title.closest("div.min-w-0") as HTMLElement;
  expect(titleCell.className).toMatch(/flex-1/);
});

it("keeps the fixed footprint compact: small badge, small meta, tight gaps", () => {
  const { container } = render(
    <SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn()} />,
  );
  const title = screen.getByText("Mitosis notes on cell division stages and checkpoint controls");
  const row = title.closest("div.flex") as HTMLElement;
  expect(row.className).toMatch(/gap-1\.5/);
  const badge = container.querySelector("span.rounded") as HTMLElement;
  expect(badge.className).toMatch(/text-\[9px\]/);
  const meta = container.querySelector("p.truncate") as HTMLElement;
  expect(meta.className).toMatch(/text-\[10px\]/);
});
