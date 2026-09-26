// @vitest-environment jsdom
// Round 15 item 6: tour card shows the Escape-to-skip hint.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FirstRunTour from "./FirstRunTour";

afterEach(() => cleanup());

it("renders the Escape skip hint", () => {
  render(
    <FirstRunTour
      step={{ title: "Start here", description: "Do things." }}
      index={0}
      total={3}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
    />,
  );
  expect(screen.getByText(/press escape to skip at any time/i)).toBeTruthy();
});
