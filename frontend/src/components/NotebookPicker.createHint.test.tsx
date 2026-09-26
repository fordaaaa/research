// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

function renderPicker() {
  render(
    <NotebookPicker
      notebooks={[]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

it("explains why Create is disabled until a name is typed", () => {
  renderPicker();
  const input = screen.getByPlaceholderText(/new notebook name/i);
  const create = screen.getByRole("button", { name: /^create$/i });
  expect(create.hasAttribute("disabled")).toBe(true);
  // Helper text announces the requirement and is referenced by the input.
  const helper = screen.getByText("Name your notebook to continue");
  expect(helper.getAttribute("id")).toBeTruthy();
  expect(input.getAttribute("aria-describedby")).toContain(helper.getAttribute("id")!);
});

it("lifts the explanation once a name is typed", () => {
  renderPicker();
  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), {
    target: { value: "Biology 101" },
  });
  expect(screen.queryByText("Name your notebook to continue")).toBeNull();
  expect(screen.getByRole("button", { name: /^create$/i }).hasAttribute("disabled")).toBe(false);
});
