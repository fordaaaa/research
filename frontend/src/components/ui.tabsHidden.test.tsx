// @vitest-environment jsdom
// Round 19 item 4 (FAILING first): a display:none/inert tablist must not keep
// aria-selected=true (twin-tabs smell). While hidden/inert every tab exposes
// aria-selected=false; internal selection is preserved so re-show restores it.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Tabs } from "./ui";

afterEach(() => cleanup());

const OPTIONS = [
  { value: "sources", label: "Sources" },
  { value: "notes", label: "Notes" },
];

it("hidden (inert) tablist exposes no selected tab", () => {
  render(<Tabs label="Library" options={OPTIONS} value="sources" onChange={vi.fn()} inert />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(2);
  for (const tab of tabs) {
    expect(tab.getAttribute("aria-selected")).toBe("false");
  }
});

it("re-show restores the preserved internal selection", () => {
  const { rerender } = render(
    <Tabs label="Library" options={OPTIONS} value="notes" onChange={vi.fn()} inert />,
  );
  expect(screen.getAllByRole("tab").every((tab) => tab.getAttribute("aria-selected") === "false")).toBe(
    true,
  );
  rerender(<Tabs label="Library" options={OPTIONS} value="notes" onChange={vi.fn()} />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs[0].getAttribute("aria-selected")).toBe("false");
  expect(tabs[1].getAttribute("aria-selected")).toBe("true");
});
