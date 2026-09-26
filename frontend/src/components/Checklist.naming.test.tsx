// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../sound", () => ({
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import Checklist from "./Checklist";

afterEach(() => cleanup());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("round8 item8 checklist naming", () => {
  it("pending rows name the destination so a dead-end never poses as actionable", () => {
    render(<Checklist userId="round8-ask" />);
    const row = screen.getByRole("button", { name: /search or ask/i });
    const name = row.getAttribute("aria-label") ?? "";
    expect(name).toMatch(/not done/i);
    expect(name).toMatch(/go to search/i);
  });

  it("all rows carry navigation cues, done or not", () => {
    render(<Checklist userId="round8-all" hasNotebook hasSource hasSearched hasExportedOrReviewed />);
    for (const re of [/create or open/i, /add a source/i, /search or ask/i, /export or review/i]) {
      const row = screen.getByRole("button", { name: re });
      expect((row.getAttribute("aria-label") ?? "").toLowerCase()).toMatch(/go to/);
    }
  });
});
