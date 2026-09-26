// @vitest-environment jsdom
// Round 21 item 4 (FAILING first): the whole notebook card opens the notebook
// (pointer affordance); Delete keeps its two-tap flow without opening; the
// Open button fires exactly once (no card-bubble double-fire).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

const NOTEBOOKS = [{ id: "a1b2c3d4e5f6", name: "Biology", created_at: "2026-01-01T00:00:00Z" }];

function renderPicker() {
  const onOpen = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <NotebookPicker notebooks={NOTEBOOKS} onOpen={onOpen} onCreate={onCreate} onDelete={onDelete} />,
  );
  return { container, onOpen, onDelete };
}

it("clicking the card body opens the notebook", () => {
  const { container, onOpen } = renderPicker();
  const card = container.querySelector("li > div");
  if (!(card instanceof HTMLElement)) throw new Error("missing notebook card");
  fireEvent.click(card);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(NOTEBOOKS[0]);
});

it("Delete still two-taps without opening the notebook", () => {
  const { onOpen, onDelete } = renderPicker();
  fireEvent.click(screen.getByRole("button", { name: "Delete Biology" }));
  expect(onOpen).not.toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /confirm delete biology/i }));
  expect(onDelete).toHaveBeenCalledWith("a1b2c3d4e5f6");
  expect(onOpen).not.toHaveBeenCalled();
});

it("the Open button fires exactly once (no card-bubble double-fire)", () => {
  const { onOpen } = renderPicker();
  fireEvent.click(screen.getByRole("button", { name: "Open Biology" }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
