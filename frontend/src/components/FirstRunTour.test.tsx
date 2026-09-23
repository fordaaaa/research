// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
