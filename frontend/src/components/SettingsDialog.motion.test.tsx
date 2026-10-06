// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog";

const apiMocks = vi.hoisted(() => ({ getAISettings: vi.fn() }));
vi.mock("../api", () => ({ getToken: () => null, ...apiMocks }));
vi.mock("thinking-orbs", () => ({
  ThinkingOrb: (props: { "aria-label": string; state: string }) =>
    <div role="img" aria-label={props["aria-label"]} data-state={props.state} />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showSettings() {
  return render(<SettingsDialog open onClose={vi.fn()} onChanged={vi.fn()}
    appearance={{ theme: "paper", font: "readable" }} onAppearanceChange={vi.fn()} />);
}

it("lets users exercise thinking, an answer, and an error without configuring AI", () => {
  showSettings();
  fireEvent.click(screen.getByRole("button", { name: "Try motion" }));
  const preview = within(screen.getByRole("region", { name: "Motion preview" }));
  fireEvent.click(preview.getByRole("button", { name: "AI thinking" }));
  expect(preview.getByRole("img", { name: "AI is thinking…" })).toBeTruthy();
  fireEvent.change(preview.getByRole("combobox", { name: "Thinking style" }), { target: { value: "solving" } });
  expect(preview.getByRole("img", { name: "Reasoning…" })).toBeTruthy();
  fireEvent.click(preview.getByRole("button", { name: "Show sample answer" }));
  expect(preview.getByText("Mitochondria help cells produce ATP." )).toBeTruthy();
  expect(preview.queryByRole("img")).toBeNull();
  fireEvent.click(preview.getByRole("button", { name: "Replay thinking" }));
  fireEvent.click(preview.getByRole("button", { name: "Show sample error" }));
  expect(preview.getByRole("alert").textContent).toContain("Sample error");
  expect(apiMocks.getAISettings).not.toHaveBeenCalled();
});

it("previews loading and card flips, then stops all preview content", () => {
  showSettings();
  fireEvent.click(screen.getByRole("button", { name: "Try motion" }));
  const preview = within(screen.getByRole("region", { name: "Motion preview" }));
  expect(preview.getByRole("status").textContent).toContain("Opening notebook…");
  fireEvent.click(preview.getByRole("button", { name: "Flashcards" }));
  const flip = preview.getByRole("button", { name: "Show answer" });
  flip.focus();
  fireEvent.click(flip);
  expect(preview.getByText("The cell’s main energy carrier.")).toBeTruthy();
  expect(preview.queryByText("What is ATP?")).toBeNull();
  expect(document.activeElement).toBe(preview.getByRole("button", { name: "Hide answer" }));
  fireEvent.click(preview.getByRole("button", { name: "Next sample card" }));
  expect(preview.getByText("What carries genetic information?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Stop preview" }));
  expect(screen.queryByRole("region", { name: "Motion preview" })).toBeNull();
});
