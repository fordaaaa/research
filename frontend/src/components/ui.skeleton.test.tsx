// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Skeleton } from "./ui";

afterEach(() => cleanup());

it("renders animate-pulse gray bars", () => {
  const { container } = render(<Skeleton lines={3} />);
  const el = screen.getByTestId("skeleton");
  expect(el.className).toMatch(/animate-pulse/);
  expect(container.querySelectorAll("[data-skeleton-bar]").length).toBe(3);
});
