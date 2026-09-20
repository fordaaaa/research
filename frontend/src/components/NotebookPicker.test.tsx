// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => {
  cleanup();
});

function renderPicker() {
  const onOpen = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<NotebookPicker notebooks={[]} onOpen={onOpen} onCreate={onCreate} onDelete={onDelete} />);
  return { onOpen, onCreate, onDelete };
}

function renderWithNotebook() {
  const onOpen = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <NotebookPicker
      notebooks={[{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]}
      onOpen={onOpen}
      onCreate={onCreate}
      onDelete={onDelete}
    />,
  );
  return { onOpen, onDelete };
}

describe("NotebookPicker account messaging", () => {
  it("states a free/local account is required and never claims 'no account'", () => {
    renderPicker();

    expect(screen.getByText(/free account|account.*required|needs.*account/i)).toBeTruthy();
    expect(screen.queryByText(/no account/i)).toBeNull();
  });

  it("states core workflows need no AI/provider key and local use has no paywall", () => {
    renderPicker();

    expect(screen.getAllByText(/no (AI|API|provider) key/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no paywall|free.*local/i).length).toBeGreaterThan(0);
  });

  it("calls onCreate with the typed notebook name", async () => {
    const { onCreate } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), {
      target: { value: "Biology 101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Biology 101"));
  });

  it("keeps notebook open and delete actions as separate touch-sized controls", async () => {
    const { onOpen, onDelete } = renderWithNotebook();
    const open = screen.getByRole("button", { name: /open biology/i });
    const del = screen.getByRole("button", { name: /delete biology/i });
    expect(open.contains(del)).toBe(false);
    expect(open.className).toMatch(/min-h-11/);
    expect(del.className).toMatch(/min-h-11/);

    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith("a1b2c3d4e5f6");
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: "Biology" }));
  });
});
