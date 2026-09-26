// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";

afterEach(() => cleanup());

const source: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "paste",
  title: "Mitosis notes that are far too long to fit on one row",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

it("replaces actions inline with a single confirm button (no card burst)", () => {
  const { container } = render(<SourceList sources={[source]} onOpen={vi.fn()} onDelete={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: /show source actions/i }));
  const actions = screen.getByTestId("swipe-row-actions");
  expect(actions.querySelectorAll("button")).toHaveLength(1);
  const arm = actions.querySelector('button[aria-label="Delete Mitosis notes that are far too long to fit on one row"]') as HTMLButtonElement;
  fireEvent.click(arm);
  // Same single button, now armed — no extra node bursts the card.
  expect(actions.querySelectorAll("button")).toHaveLength(1);
  const confirm = actions.querySelector('button[aria-label="Confirm delete Mitosis notes that are far too long to fit on one row"]') as HTMLButtonElement;
  expect(confirm.className).toMatch(/whitespace-nowrap/);
  const title = screen.getByText("Mitosis notes that are far too long to fit on one row");
  expect(title.className).toMatch(/line-clamp-2/);
  expect(title.closest("div.min-w-0")).toBeTruthy();
  void container;
});
