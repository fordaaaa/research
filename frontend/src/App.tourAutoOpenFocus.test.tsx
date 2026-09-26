// @vitest-environment jsdom
// Round 14 item 5: auto-open dismiss must never strand focus on a
// disconnected node / BODY — falls back to #main-content.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FirstRunTour from "./components/FirstRunTour";

afterEach(() => cleanup());

it("auto-open dismiss with a disconnected trigger falls back to main-content", () => {
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.appendChild(main);

  // Simulate the register-form input that had focus at auto-open time and
  // then unmounted (navigation) before dismiss.
  const doomed = document.createElement("input");
  doomed.setAttribute("aria-label", "register-email");
  document.body.appendChild(doomed);
  doomed.focus();
  expect(document.activeElement).toBe(doomed);

  render(
    <FirstRunTour
      step={{ title: "Auto", description: "open path." }}
      index={0}
      total={1}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
    />,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();

  // The trigger unmounts while the tour is open (landing -> workspace nav).
  doomed.remove();

  cleanup();
  const active = document.activeElement as HTMLElement | null;
  expect(active).toBe(main);
  expect(active?.isConnected).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
  main.remove();
});
