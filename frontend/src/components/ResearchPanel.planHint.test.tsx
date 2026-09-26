// @vitest-environment jsdom
// Round 17 item 5: the Plan button is disabled under 3 chars, so a helper
// text under the input says so (mirrors NotebookPicker's pattern).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ResearchPanel from "./ResearchPanel";

afterEach(() => cleanup());

it("shows the plan hint when short and hides it when valid", () => {
  render(<ResearchPanel notebookId="nb1" aiConfigured={false} onSourcesChanged={vi.fn()} />);
  const input = screen.getByPlaceholderText(/transformer models/i);
  expect(screen.getByText(/type at least 3 characters to plan/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /^plan$/i })).toHaveProperty("disabled", true);

  fireEvent.change(input, { target: { value: "ab" } });
  expect(screen.getByText(/type at least 3 characters to plan/i)).toBeTruthy();

  fireEvent.change(input, { target: { value: "abc" } });
  expect(screen.queryByText(/type at least 3 characters to plan/i)).toBeNull();
  expect(screen.getByRole("button", { name: /^plan$/i })).toHaveProperty("disabled", false);
});
