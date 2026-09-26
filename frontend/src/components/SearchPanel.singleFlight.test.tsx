// @vitest-environment jsdom
// Round 12 item 3: one search gesture must settle exactly one request — the
// debounced auto-search and the explicit submit must not double-fire.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

async function settle(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

describe("round12 item3 single-flight search", () => {
  it("typing, waiting for the auto-search, then pressing Search settles exactly one request", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await settle(450);
    expect(onSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
    await settle(600);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("a manual submit cancels the pending debounce timer", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByRole("button", { name: /submit search/i }));
    await settle(600);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
