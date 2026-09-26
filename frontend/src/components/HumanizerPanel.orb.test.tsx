// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  analyzeHumanize: vi.fn(),
  rewriteHumanize: vi.fn(),
  fixHumanize: vi.fn(),
}));

vi.mock("../api", () => apiMocks);
vi.mock("./ThinkingDots", () => ({
  default: ({ state, theme }: { state: string; theme?: string }) => (
    <span role="img" aria-label={state} data-theme={theme} />
  ),
}));
vi.mock("./Spinner", () => ({
  default: () => <span data-testid="spinner" />,
}));

import HumanizerPanel from "./HumanizerPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("rewrite with AI shows thinking orb (not spinner) while busy", async () => {
  let resolveRewrite!: (v: unknown) => void;
  apiMocks.rewriteHumanize.mockReturnValue(
    new Promise((resolve) => {
      resolveRewrite = resolve;
    }),
  );
  render(<HumanizerPanel aiConfigured />);
  fireEvent.change(screen.getByPlaceholderText(/paste the text/i), {
    target: { value: "Some AI-sounding text here" },
  });
  fireEvent.click(screen.getByRole("button", { name: /rewrite with ai/i }));
  await waitFor(() => expect(apiMocks.rewriteHumanize).toHaveBeenCalled());
  expect(screen.getByRole("img", { name: "composing" }).getAttribute("data-theme")).toBe("dark");
  expect(screen.queryByTestId("spinner")).toBeNull();
  resolveRewrite({ text: "rewritten", model: "test" });
});
