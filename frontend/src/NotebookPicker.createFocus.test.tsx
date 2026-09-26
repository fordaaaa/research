// @vitest-environment jsdom
// Round 12 item 1: creating a notebook must move focus somewhere useful and
// announce "Notebook X created" with the name in a NON-EMPTY live region.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotebookPicker from "./components/NotebookPicker";

afterEach(() => cleanup());

describe("round12 item1 notebook focus (picker level)", () => {
  it("focuses the new row after the parent list includes it and announces the name", async () => {
    const created = { id: "nb-new", name: "Chemistry 101", created_at: "2026-01-01T00:00:00Z" };
    const onCreate = vi.fn().mockResolvedValue(created);
    const { rerender } = render(
      <NotebookPicker notebooks={[]} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), {
      target: { value: "Chemistry 101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Chemistry 101"));

    // Parent refreshes the list: the new row now exists.
    rerender(
      <NotebookPicker notebooks={[created]} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />,
    );

    const open = await screen.findByRole("button", { name: "Open Chemistry 101" });
    await waitFor(() => expect(document.activeElement).toBe(open));
    const regions = screen.getAllByRole("status");
    const texts = regions.map((region) => region.textContent ?? "");
    expect(texts.some((text) => text.includes("Chemistry 101") && text.length > 0)).toBe(true);
  });
});
