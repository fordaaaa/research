// @vitest-environment jsdom
// Round 13 item 1: one typed query must settle exactly one GET even when the
// parent re-renders with fresh callback identities (App passes inline
// lambdas), and effect cleanup must abort the in-flight request + timer so
// only the latest write lands.
import { StrictMode } from "react";
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

describe("round13 item1 search double-fire", () => {
  it("a parent re-render with fresh callback identities does not re-fire the settled query", async () => {
    let calls = 0;
    const countingSearch = () => {
      calls += 1;
      return Promise.resolve([]);
    };
    const { rerender } = render(<SearchPanel onSearch={countingSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await settle(450);
    expect(calls).toBe(1);
    // App re-renders (inline lambdas => new identities) without a query change.
    rerender(<SearchPanel onSearch={() => { calls += 1; return Promise.resolve([]); }} onImportUrl={vi.fn()} onSearched={() => {}} />);
    await settle(600);
    expect(calls).toBe(1);
  });

  it("StrictMode double-invoking the debounce effect settles exactly one request", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(
      <StrictMode>
        <SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await settle(600);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("cleanup aborts the in-flight request so only the latest writes state", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    let resolveFirst!: (hits: never[]) => void;
    const onSearch = vi.fn().mockImplementation(
      () => new Promise<never[]>((resolve) => { resolveFirst = resolve; }),
    );
    const { unmount } = render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await settle(450);
    expect(onSearch).toHaveBeenCalledTimes(1);
    // Unmount aborts the in-flight request; its late resolution must not write.
    unmount();
    expect(abortSpy).toHaveBeenCalled();
    resolveFirst([]);
    await act(async () => {});
    abortSpy.mockRestore();
  });
});
