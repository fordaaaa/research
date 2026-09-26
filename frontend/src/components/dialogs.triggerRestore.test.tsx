// @vitest-environment jsdom
// Round 20 item 1 (FAILING first): dialogs must restore focus to the opener
// passed explicitly via a `trigger` prop (captured synchronously in the
// click handler), because mount-time activeElement capture is too late for
// auto-opened and async-opened dialogs. trigger={null} (auto-open) falls
// back to #main-content.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SourceDetail } from "../api";

vi.mock("../api", () => ({
  getToken: () => null,
  getAISettings: vi.fn().mockRejectedValue(new Error("offline")),
  getSource: vi.fn().mockResolvedValue({
    id: "source-1",
    notebook_id: "notebook-1",
    kind: "pdf",
    title: "Trigger title",
    tags: [],
    meta: { page_count: 1 },
    created_at: "2026-01-01T00:00:00Z",
    chunk_count: 1,
    pages: [{ number: 1, text: "Page one" }],
    chunks: [],
  } satisfies SourceDetail),
}));

import SettingsDialog from "./SettingsDialog";
import FirstRunTour from "./FirstRunTour";
import ReaderModal from "./ReaderModal";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function makeMainContent(): HTMLElement {
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.appendChild(main);
  return main;
}

it("SettingsDialog restores to the passed trigger even when focus moved before mount", () => {
  makeMainContent();
  const trigger = document.createElement("button");
  trigger.textContent = "open settings";
  document.body.appendChild(trigger);
  // Simulate the async-open focus move: by mount time focus is elsewhere.
  const elsewhere = document.createElement("button");
  elsewhere.textContent = "elsewhere";
  document.body.appendChild(elsewhere);
  elsewhere.focus();
  const { unmount } = render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
      trigger={trigger}
    />,
  );
  expect(document.activeElement).not.toBe(trigger);
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("SettingsDialog with trigger={null} (auto-open) falls back to #main-content", () => {
  const main = makeMainContent();
  const { unmount } = render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
      trigger={null}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  unmount();
  expect(document.activeElement).toBe(main);
});

it("FirstRunTour restores to the passed trigger even when focus moved before mount", () => {
  makeMainContent();
  const trigger = document.createElement("button");
  trigger.textContent = "tour trigger";
  document.body.appendChild(trigger);
  const elsewhere = document.createElement("button");
  elsewhere.textContent = "elsewhere";
  document.body.appendChild(elsewhere);
  elsewhere.focus();
  const { unmount } = render(
    <FirstRunTour
      step={{ title: "Step one", description: "Do the thing." }}
      index={0}
      total={2}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      trigger={trigger}
    />,
  );
  expect(document.activeElement).not.toBe(trigger);
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("FirstRunTour with trigger={null} (auto-open) falls back to #main-content", () => {
  const main = makeMainContent();
  const { unmount } = render(
    <FirstRunTour
      step={{ title: "Step one", description: "Do the thing." }}
      index={0}
      total={2}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      trigger={null}
    />,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  unmount();
  expect(document.activeElement).toBe(main);
});

it("ReaderModal restores to the passed trigger even when focus moved before mount", async () => {
  makeMainContent();
  const trigger = document.createElement("button");
  trigger.textContent = "read trigger";
  document.body.appendChild(trigger);
  const elsewhere = document.createElement("button");
  elsewhere.textContent = "elsewhere";
  document.body.appendChild(elsewhere);
  elsewhere.focus();
  const { unmount } = render(<ReaderModal sourceId="source-1" onClose={vi.fn()} trigger={trigger} />);
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  expect(document.activeElement).not.toBe(trigger);
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it("ReaderModal with trigger={null} falls back instead of stranding on BODY", async () => {
  makeMainContent();
  const { unmount } = render(<ReaderModal sourceId="source-1" onClose={vi.fn()} trigger={null} />);
  await waitFor(() => expect(screen.getByText("Page one")).toBeTruthy());
  unmount();
  expect(document.activeElement).not.toBe(document.body);
});
