// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

it("highlights the requested control and closes on Escape", () => {
  const target = document.createElement("button");
  target.dataset.tour = "create-notebook";
  target.getBoundingClientRect = () => ({ left: 40, top: 80, width: 200, height: 60, right: 240, bottom: 140, x: 40, y: 80, toJSON: () => ({}) });
  document.body.appendChild(target);
  const onSkip = vi.fn();

  render(<FirstRunTour step={{ title: "Create a notebook", description: "Start here.", targets: ['[data-tour="create-notebook"]'] }} index={1} total={3} onNext={vi.fn()} onBack={vi.fn()} onSkip={onSkip} />);
  expect(screen.getByTestId("tour-spotlight").style.left).toBe("32px");
  const dialog = screen.getByRole("dialog", { name: "Create a notebook" });
  expect(dialog.getAttribute("aria-modal")).toBe("false");
  target.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Skip tour" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onSkip).toHaveBeenCalledOnce();
  target.remove();
});

it("keeps the spotlight aligned while a target moves during its entrance animation", () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const target = document.createElement("button");
  target.dataset.tour = "moving";
  let left = 40;
  target.getBoundingClientRect = () => ({ left, top: 80, width: 200, height: 60, right: left + 200, bottom: 140, x: left, y: 80, toJSON: () => ({}) });
  document.body.appendChild(target);

  render(<FirstRunTour step={{ title: "Moving target", description: "Follow this.", targets: ['[data-tour="moving"]'] }} index={0} total={1} onNext={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()} />);
  expect(screen.getByTestId("tour-spotlight").style.left).toBe("32px");
  left = 100;
  act(() => frame?.(0));
  expect(screen.getByTestId("tour-spotlight").style.left).toBe("92px");
  target.remove();
  vi.unstubAllGlobals();
});
