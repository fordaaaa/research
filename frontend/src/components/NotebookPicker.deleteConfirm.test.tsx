// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

const NOTEBOOKS = [{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }];

function renderPicker(onDelete = vi.fn().mockResolvedValue(undefined)) {
  const onOpen = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={onOpen} onCreate={onCreate} onDelete={onDelete} />,
  );
  return { onDelete, onOpen };
}

it("notebook Delete is two-tap: first click arms, second click deletes", () => {
  const { onDelete } = renderPicker();
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(onDelete).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: /confirm delete biology/i });
  expect(confirm.textContent).toMatch(/confirm/i);
  fireEvent.click(confirm);
  expect(onDelete).toHaveBeenCalledWith("a1b2c3d4e5f6");
});

it("notebook Delete cancel path disarms on Escape without deleting", () => {
  const { onDelete } = renderPicker();
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  fireEvent.keyDown(screen.getByRole("button", { name: /confirm delete/i }), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Delete Biology" })).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});
