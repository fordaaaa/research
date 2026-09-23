// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ThinkingDots from "./ThinkingDots";

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({ theme, state, ...props }: { theme: string; state: string; "aria-label": string }) => (
    <div role="img" data-theme={theme} data-state={state} aria-label={props["aria-label"]} />
  ),
}));

afterEach(cleanup);

describe("ThinkingDots", () => {
  it("uses light ink on dark primary buttons", () => {
    render(<ThinkingDots state="searching" theme="dark" />);
    expect(screen.getByRole("img", { name: "Searching…" }).getAttribute("data-theme")).toBe("dark");
  });

  it("keeps dark ink on the light page background", () => {
    render(<ThinkingDots state="composing" />);
    expect(screen.getByRole("img", { name: "Writing…" }).getAttribute("data-theme")).toBe("light");
  });
});
