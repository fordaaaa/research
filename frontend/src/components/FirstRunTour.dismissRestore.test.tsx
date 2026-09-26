// @vitest-environment jsdom
// Round 21 item 6 (audit lock): BOTH dismiss paths — Skip button and Escape —
// must restore focus to the passed explicit trigger when connected, else to
// #main-content. Audit: both paths call onSkip() and converge on the single
// mount-effect unmount cleanup, which already prefers the R20 trigger prop.
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const STEP = { title: "Step one", description: "Do the thing." };

function Harness({ trigger }: { trigger: HTMLElement | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {open && (
        <FirstRunTour
          step={STEP}
          index={0}
          total={2}
          onNext={() => {}}
          onBack={() => {}}
          onSkip={() => setOpen(false)}
          trigger={trigger}
        />
      )}
    </>
  );
}

function makeMainContent(): HTMLElement {
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.appendChild(main);
  return main;
}

function makeTrigger(label: string): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.textContent = label;
  document.body.appendChild(trigger);
  return trigger;
}

it("Escape with a connected trigger restores to the trigger", () => {
  makeMainContent();
  const trigger = makeTrigger("tour opener");
  render(<Harness trigger={trigger} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("Skip with a connected trigger restores to the trigger", () => {
  makeMainContent();
  const trigger = makeTrigger("tour opener");
  render(<Harness trigger={trigger} />);
  fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("Escape without a trigger falls back to #main-content", () => {
  const main = makeMainContent();
  render(<Harness trigger={null} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(main);
});

it("Skip without a trigger falls back to #main-content", () => {
  const main = makeMainContent();
  render(<Harness trigger={null} />);
  fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(main);
});
