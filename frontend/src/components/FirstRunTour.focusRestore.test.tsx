// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

const STEP = { title: "Step one", description: "Do the thing." };

function renderWithTrigger() {
  const onNext = vi.fn();
  const onSkip = vi.fn();
  const onBack = vi.fn();
  const trigger = document.createElement("button");
  trigger.textContent = "tour trigger";
  document.body.appendChild(trigger);
  trigger.focus();
  const focusedAtFocusTime: { inertAtCall: boolean | null } = { inertAtCall: null };
  const origFocus = trigger.focus.bind(trigger);
  trigger.focus = () => {
    const root = document.getElementById("root");
    focusedAtFocusTime.inertAtCall = root ? root.hasAttribute("inert") : document.body.hasAttribute("inert");
    return origFocus();
  };
  // Real app path: content lives under #root which the tour inerts.
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  root.appendChild(trigger);
  trigger.focus();
  return { onNext, onSkip, onBack, trigger, focusedAtFocusTime, root };
}

describe("round8 item7 tour focus restore", () => {
  it("Skip path restores focus with inert already removed", () => {
    const ctx = renderWithTrigger();
    const { unmount } = render(
      <FirstRunTour step={STEP} index={0} total={2} onNext={ctx.onNext} onBack={ctx.onBack} onSkip={ctx.onSkip} />,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(ctx.onSkip).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(ctx.trigger);
    expect(ctx.focusedAtFocusTime.inertAtCall).toBe(false);
    ctx.root.remove();
  });

  it("Escape path restores focus with inert already removed", () => {
    const ctx = renderWithTrigger();
    const { unmount } = render(
      <FirstRunTour step={STEP} index={0} total={2} onNext={ctx.onNext} onBack={ctx.onBack} onSkip={ctx.onSkip} />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(ctx.onSkip).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(ctx.trigger);
    expect(ctx.focusedAtFocusTime.inertAtCall).toBe(false);
    ctx.root.remove();
  });

  it("scrim path restores focus with inert already removed", () => {
    const ctx = renderWithTrigger();
    const { unmount } = render(
      <FirstRunTour step={STEP} index={0} total={2} onNext={ctx.onNext} onBack={ctx.onBack} onSkip={ctx.onSkip} />,
    );
    fireEvent.click(document.querySelector('[data-testid="tour-scrim"]')!);
    expect(ctx.onSkip).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(ctx.trigger);
    expect(ctx.focusedAtFocusTime.inertAtCall).toBe(false);
    ctx.root.remove();
  });

  it("Next-finish path restores focus with inert already removed", () => {
    const ctx = renderWithTrigger();
    const { unmount } = render(
      <FirstRunTour step={STEP} index={1} total={2} nextLabel="Finish" onNext={ctx.onNext} onBack={ctx.onBack} onSkip={ctx.onSkip} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(ctx.onNext).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(ctx.trigger);
    expect(ctx.focusedAtFocusTime.inertAtCall).toBe(false);
    ctx.root.remove();
  });
});
