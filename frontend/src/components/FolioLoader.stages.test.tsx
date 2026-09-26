// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";

vi.mock("../useMountTransition", async () => {
  const actual = await vi.importActual<typeof import("../useMountTransition")>(
    "../useMountTransition",
  );
  return { ...actual, usePrefersReducedMotion: () => false };
});

import FolioLoader from "./FolioLoader";

afterEach(() => cleanup());

it("cycles subtitle through stages on ~1.1s interval", () => {
  vi.useFakeTimers();
  try {
    render(<FolioLoader title="Loading" stages={["Stage one", "Stage two", "Stage three"]} />);
    expect(screen.getByRole("status").textContent ?? "").toContain("Stage one");
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole("status").textContent ?? "").toContain("Stage two");
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole("status").textContent ?? "").toContain("Stage three");
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole("status").textContent ?? "").toContain("Stage one");
  } finally {
    vi.useRealTimers();
  }
});
