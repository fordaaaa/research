// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as api from "../api";
import SearchPanel from "./SearchPanel";

vi.mock("./ThinkingDots", () => ({
  default: () => <span data-testid="orb" />,
}));
vi.mock("./Spinner", () => ({
  default: () => <span data-testid="spinner" />,
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(450);
  });
}

describe("round10 item1 live debounced search", () => {
  it("typing in sources mode fires search after the debounce", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    expect(onSearch).not.toHaveBeenCalled();
    await flush();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("cell biology", expect.anything());
  });

  it("does not auto-search short queries (fewer than 2 non-space chars)", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "a " },
    });
    await flush();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("does not auto-fire in web mode (explicit search only)", async () => {
    const webSpy = vi.spyOn(api, "searchWeb").mockResolvedValue([]);
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    fireEvent.change(screen.getByPlaceholderText("Search the web…"), {
      target: { value: "cell biology" },
    });
    await flush();
    expect(webSpy).not.toHaveBeenCalled();
    expect(onSearch).not.toHaveBeenCalled();
    webSpy.mockRestore();
  });

  it("switching to web mode cancels a pending sources auto-search", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
      target: { value: "cell biology" },
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByRole("button", { name: "Search the web" }));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(onSearch).not.toHaveBeenCalled();
  });
});
