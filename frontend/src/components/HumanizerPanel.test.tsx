// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  analyzeHumanize: vi.fn(),
  rewriteHumanize: vi.fn(),
  fixHumanize: vi.fn(),
}));

vi.mock("../api", () => apiMocks);

import HumanizerPanel from "./HumanizerPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HumanizerPanel", () => {
  it("keeps deterministic fix buttons available when AI is off", async () => {
    apiMocks.fixHumanize.mockResolvedValue({
      text: "Hello",
      operations: [{ operation: "remove_decoration", count: 2 }],
    });
    render(<HumanizerPanel aiConfigured={false} />);

    fireEvent.change(screen.getByPlaceholderText(/paste the text/i), {
      target: { value: "**Hello** ➜" },
    });
    const fix = screen.getByRole("button", { name: /remove decoration/i });
    const ai = screen.getByRole("button", { name: /rewrite with ai/i });
    expect(fix.hasAttribute("disabled")).toBe(false);
    expect(ai.hasAttribute("disabled")).toBe(true);

    fireEvent.click(fix);
    await waitFor(() =>
      expect(apiMocks.fixHumanize).toHaveBeenCalledWith("**Hello** ➜", ["remove_decoration"]),
    );
    expect(await screen.findByText("Hello")).toBeTruthy();
  });

  it("labels every editor for screen readers and keeps toggles touch-sized", () => {
    render(<HumanizerPanel aiConfigured={false} />);
    expect(screen.getByLabelText(/text to check/i)).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /voice sample/i });
    expect(toggle.className).toMatch(/min-h-11/);
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/voice sample/i)).toBeTruthy();
  });
});
