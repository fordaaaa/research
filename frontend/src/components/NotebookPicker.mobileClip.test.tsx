// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

it("card titles truncate with ellipsis (no mid-glyph hard clip at 390px)", () => {
  render(
    <NotebookPicker
      notebooks={[
        { id: "n1", name: "That Shakespeare Play About Something", created_at: "2026-01-01T00:00:00Z" },
      ]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  const title = screen.getByText("That Shakespeare Play About Something");
  // Tailwind `truncate` = overflow hidden + ellipsis + no wrap.
  expect(title.className).toMatch(/truncate/);
  expect(title.className).toMatch(/ellipsis|truncate/);
  // The flex card wrapper must shrink (min-w-0) so the title can ellipsize
  // instead of overflowing the 390px card.
  const card = title.closest("li > div");
  expect(card?.className).toMatch(/min-w-0/);
});
