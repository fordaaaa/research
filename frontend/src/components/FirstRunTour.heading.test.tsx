// @vitest-environment jsdom
// Round 12 item 2: the tour dialog heading must be a real heading (h2) and
// the dialog must reference it via aria-labelledby.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

it("labels the tour dialog with an h2 heading", () => {
  render(
    <FirstRunTour
      step={{ title: "Start with a notebook", description: "Make one for a class." }}
      index={0}
      total={3}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
    />,
  );
  const heading = screen.getByRole("heading", { name: "Start with a notebook" });
  expect(heading.tagName).toBe("H2");
  expect(heading.getAttribute("id")).toBe("tour-title");
  const dialog = screen.getByRole("dialog", { name: "Start with a notebook" });
  expect(dialog.getAttribute("aria-labelledby")).toBe("tour-title");
});
