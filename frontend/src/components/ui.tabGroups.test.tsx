// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Tabs } from "./ui";

afterEach(() => cleanup());

describe("round8 item6 landmarks", () => {
  it("tab groups expose tablist semantics with an accessible label", () => {
    render(
      <Tabs
        label="Workspace sections"
        options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
        value="a"
        onChange={vi.fn()}
      />,
    );
    const list = screen.getByRole("tablist", { name: "Workspace sections" });
    expect(list).toBeTruthy();
    expect(screen.getByRole("tab", { selected: true })).toBeTruthy();
  });
});
