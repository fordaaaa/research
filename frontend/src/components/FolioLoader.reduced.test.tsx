// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../useMountTransition", async () => {
  const actual = await vi.importActual<typeof import("../useMountTransition")>(
    "../useMountTransition",
  );
  return { ...actual, usePrefersReducedMotion: () => true };
});

import FolioLoader from "./FolioLoader";

afterEach(() => cleanup());

it("pins first stage when reduced motion is on", () => {
  vi.useFakeTimers();
  try {
    render(<FolioLoader title="Loading" stages={["Stage one", "Stage two"]} />);
    vi.advanceTimersByTime(5000);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("Stage one");
    expect(text).not.toContain("Stage two");
  } finally {
    vi.useRealTimers();
  }
});
