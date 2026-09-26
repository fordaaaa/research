// @vitest-environment jsdom
// Round 16 item 5: responsive duplicates must never be tab-reachable while
// hidden. Structural assertions per surface:
// - SourceList: the swipe-actions Confirm twin lives inside [inert] +
//   visibility:hidden until revealed; the sm+ inline twin is display:none
//   below sm (hidden class).
// - ui Tabs/BottomNav: the inert prop actually lands on the DOM node so the
//   off-breakpoint variant is never tab-reachable.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SourceSummary } from "../api";
import SourceList from "./SourceList";
import { BottomNav, Tabs } from "./ui";

afterEach(() => cleanup());

const SOURCE: SourceSummary = {
  id: "source-1",
  notebook_id: "notebook-1",
  kind: "pdf",
  title: "Cell biology notes",
  tags: [],
  meta: { page_count: 2 },
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 3,
};

function tabbable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [role="tab"]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest("[inert]") &&
      getComputedStyle(el).visibility !== "hidden" &&
      getComputedStyle(el).display !== "none",
  );
}

it("armed Confirm twin in swipe actions is inert-hidden, not tab-reachable", () => {
  const { container } = render(
    <SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn()} />,
  );
  // Round 24 item 1: closed rows mount no hidden swipe copy — the DOM and
  // the a11y tree each expose a single Confirm (the inline twin). The
  // swipe container only exists once revealed.
  fireEvent.click(screen.getByRole("button", { name: "Delete Cell biology notes" }));
  const twins = container.querySelectorAll(
    'button[aria-label="Confirm delete Cell biology notes"]',
  );
  expect(twins.length).toBe(1);
  expect(
    screen.getAllByRole("button", { name: "Confirm delete Cell biology notes" }).length,
  ).toBe(1);
  expect(container.querySelector('[data-testid="swipe-row-actions"]')).toBeNull();
  // Only the inline twin is tab-reachable while swipe is closed.
  const reachable = tabbable(container as HTMLElement)
    .map((el) => el.getAttribute("aria-label"))
    .filter((label) => label === "Confirm delete Cell biology notes");
  expect(reachable.length).toBe(1);
  // Revealed state still mounts the swipe actions.
  fireEvent.click(screen.getByRole("button", { name: /show source actions/i }));
  const revealed = container.querySelector('[data-testid="swipe-row-actions"]') as HTMLElement;
  expect(revealed).toBeTruthy();
  expect(revealed.querySelector('button[aria-label="Confirm delete Cell biology notes"]')).toBeTruthy();
});

it("sm+ inline delete twin is display:none below sm", () => {
  const { container } = render(
    <SourceList sources={[SOURCE]} onOpen={vi.fn()} onDelete={vi.fn()} />,
  );
  const inline = container.querySelector(
    '[data-testid="source-delete-inline"]',
  ) as HTMLElement;
  expect(inline).toBeTruthy();
  expect(inline.className).toMatch(/hidden/);
  expect(inline.className).toMatch(/sm:inline-flex/);
});

it("Tabs/BottomNav propagate inert to the DOM node", () => {
  const { container } = render(
    <>
      <Tabs
        label="Workspace sections"
        options={[{ value: "search", label: "Search" }]}
        value="search"
        onChange={vi.fn()}
        inert
      />
      <BottomNav
        label="Notebook sections"
        items={[{ value: "library", label: "Library" }]}
        value="library"
        onChange={vi.fn()}
        inert
      />
    </>,
  );
  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist?.hasAttribute("inert")).toBe(true);
  const nav = container.querySelector('nav[aria-label="Notebook sections"]');
  expect(nav?.hasAttribute("inert")).toBe(true);
});
