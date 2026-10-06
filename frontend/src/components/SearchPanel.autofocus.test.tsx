// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchPanel from "./SearchPanel";

afterEach(() => cleanup());

describe("round8 item5 search affordance", () => {
  it("autofocuses the search input on view mount", () => {
    render(<SearchPanel onSearch={vi.fn()} onImportUrl={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/search your sources/i));
  });

  it("submits on Enter via the form", async () => {
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchPanel onSearch={onSearch} onImportUrl={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search your sources/i);
    fireEvent.change(input, { target: { value: "chlorophyll" } });
    fireEvent.submit(input.closest("form")!);
    await vi.waitFor(() => expect(onSearch).toHaveBeenCalledWith("chlorophyll", expect.any(AbortSignal)));
  });
});
