// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

const STEP = { title: "Create a notebook", description: "Start here." };

function renderTour(onSkip = vi.fn()) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  render(<FirstRunTour step={STEP} index={0} total={3} onNext={onNext} onBack={onBack} onSkip={onSkip} />);
  return { onSkip, onNext, onBack };
}

it("dismisses on Escape via a capture-phase listener (works first time)", () => {
  const { onSkip } = renderTour();
  const dialog = screen.getByRole("dialog");
  // A bubble-phase listener registered elsewhere that stops propagation must not block dismissal.
  const stopper = (event: Event) => event.stopPropagation();
  document.addEventListener("keydown", stopper, true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  document.removeEventListener("keydown", stopper, true);
  expect(onSkip).toHaveBeenCalledTimes(1);
});

it("dismisses when the scrim outside the card is clicked, but not when the card is clicked", () => {
  const { onSkip } = renderTour();
  const dialog = screen.getByRole("dialog");
  fireEvent.click(dialog);
  expect(onSkip).not.toHaveBeenCalled();
  const scrim = document.querySelector('[data-testid="tour-scrim"]');
  expect(scrim).toBeTruthy();
  fireEvent.click(scrim!);
  expect(onSkip).toHaveBeenCalledTimes(1);
});

it("moves initial focus into the card primary button and returns focus on dismiss", () => {
  const before = document.createElement("button");
  before.textContent = "before";
  document.body.appendChild(before);
  before.focus();
  expect(document.activeElement).toBe(before);
  const { onSkip: _skipped } = renderTour();
  void _skipped;
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
  cleanup();
  expect(document.activeElement).toBe(before);
  before.remove();
});
