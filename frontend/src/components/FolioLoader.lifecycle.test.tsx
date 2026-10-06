// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import FolioLoader from "./FolioLoader";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keeps the loading cadence across parent rerenders with equal stages", () => {
  vi.useFakeTimers();
  const view = render(<FolioLoader title="Loading" stages={["One", "Two"]} />);
  act(() => vi.advanceTimersByTime(1000));
  view.rerender(<FolioLoader title="Loading" stages={["One", "Two"]} />);
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole("status").textContent).toContain("Two");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("gives simultaneous loaders independent SVG filter IDs", () => {
  const { container } = render(<><FolioLoader title="Boot" /><FolioLoader title="Preview" /></>);
  const ids = [...container.querySelectorAll("filter")].map((filter) => filter.id);
  expect(new Set(ids).size).toBe(2);
  expect([...container.querySelectorAll("rect[filter]")].map((rect) => rect.getAttribute("filter"))).toEqual(ids.map((id) => `url(#${id})`));
});
