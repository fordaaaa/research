// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BottomNav, SwipeRow, Tabs } from "./ui";

afterEach(() => {
  cleanup();
});

describe("mobile UI primitives", () => {
  it("moves tabs with arrow keys and exposes roving tab stops", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        options={[
          { value: "sources", label: "Sources" },
          { value: "notes", label: "Notes" },
          { value: "ask", label: "Ask" },
        ]}
        value="sources"
        onChange={onChange}
      />,
    );

    const sources = screen.getByRole("tab", { name: "Sources" });
    const notes = screen.getByRole("tab", { name: "Notes" });
    expect(sources.tabIndex).toBe(0);
    expect(notes.tabIndex).toBe(-1);

    sources.focus();
    fireEvent.keyDown(sources, { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith("notes");
    expect(document.activeElement).toBe(notes);
  });

  it("renders a labelled mobile nav with a current destination", () => {
    const onChange = vi.fn();
    render(
      <BottomNav
        label="Notebook sections"
        items={[
          { value: "collect", label: "Collect" },
          { value: "notes", label: "Notes" },
        ]}
        value="notes"
        onChange={onChange}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Notebook sections" });
    const collect = screen.getByRole("button", { name: "Collect" });
    const notes = screen.getByRole("button", { name: "Notes" });
    expect(nav).toBeTruthy();
    expect(notes.getAttribute("aria-current")).toBe("page");
    expect(collect.className).toContain("min-h-11");

    fireEvent.click(collect);
    expect(onChange).toHaveBeenCalledWith("collect");
  });

  it("reveals swipe actions by gesture and by a visible button", () => {
    render(
      <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
        <span>Cell biology notes</span>
      </SwipeRow>,
    );

    const toggle = screen.getByRole("button", { name: "Show Source actions" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    const surface = screen.getByTestId("swipe-row-surface");
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 20, clientY: 102, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 20, clientY: 102, pointerId: 1 });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps swipe actions out of the tab order until they are revealed", () => {
    render(
      <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
        <span>Cell biology notes</span>
      </SwipeRow>,
    );

    // Round 24 item 1: closed rows mount no hidden action twins — nothing
    // in the a11y tree until revealed (no aria-hidden/inert placeholder).
    expect(screen.queryByTestId("swipe-row-actions")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show Source actions" }));
    const revealed = screen.getByTestId("swipe-row-actions");
    expect(revealed.getAttribute("aria-label")).toBe("Source actions");
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("ignores a mostly vertical drag so scrolling never opens actions", () => {
    render(
      <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
        <span>Cell biology notes</span>
      </SwipeRow>,
    );

    const toggle = screen.getByRole("button", { name: "Show Source actions" });
    const surface = screen.getByTestId("swipe-row-surface");
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 90, clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 90, clientY: 220, pointerId: 1 });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves bottom-nav positioning to the caller", () => {
    render(
      <BottomNav
        label="Notebook sections"
        items={[{ value: "notes", label: "Notes" }]}
        value="notes"
        onChange={() => undefined}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Notebook sections" });
    expect(nav.className).not.toMatch(/sticky/);
    expect(nav.className).not.toMatch(/fixed/);
  });

  it("does not capture the pointer on pointerdown so inner clicks still fire", () => {
    const onRead = vi.fn();
    render(
      <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
        <button type="button" onClick={onRead}>Read Cell notes</button>
      </SwipeRow>,
    );

    const surface = screen.getByTestId("swipe-row-surface");
    const capture = vi.fn();
    (surface as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 100, pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();

    // A tap with only a tiny move must leave the row action clickable.
    fireEvent.pointerMove(surface, { clientX: 124, clientY: 101, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 124, clientY: 101, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Read Cell notes" }));
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it("captures only after a horizontal-drag threshold and survives capture throws", () => {
    render(
      <SwipeRow actionLabel="Source actions" actions={<button type="button">Delete</button>}>
        <span>Cell biology notes</span>
      </SwipeRow>,
    );

    const toggle = screen.getByRole("button", { name: "Show Source actions" });
    const surface = screen.getByTestId("swipe-row-surface");
    const capture = vi.fn(() => {
      throw new DOMException("capture failed", "NotFoundError");
    });
    (surface as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;

    expect(() => {
      fireEvent.pointerDown(surface, { clientX: 120, clientY: 100, pointerId: 7 });
      fireEvent.pointerMove(surface, { clientX: 20, clientY: 102, pointerId: 7 });
      fireEvent.pointerUp(surface, { clientX: 20, clientY: 102, pointerId: 7 });
    }).not.toThrow();
    expect(capture).toHaveBeenCalled();
    // The large swipe still reveals actions despite the capture failure.
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
