// @vitest-environment jsdom
// Round 21 item 5 (audit lock): the Getting-started checklist renders on a
// fresh EMPTY library — its mount condition is `userId` only, never gated on
// tourPending or notebooks.length. It mounts below the tour banner.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotebookPicker from "./NotebookPicker";

afterEach(() => cleanup());

function renderEmptyLibrary(extra: Record<string, unknown> = {}) {
  render(
    <NotebookPicker
      notebooks={[]}
      tourPending={false}
      tourActive={false}
      userId="fresh-user"
      sourcesCount={0}
      hasSearched={false}
      hasExportedOrReviewed={false}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      {...extra}
    />,
  );
}

it("renders the checklist on an empty library with no pending tour", () => {
  renderEmptyLibrary();
  expect(screen.getByRole("heading", { name: "Getting started" })).toBeTruthy();
  expect(screen.getByText("No notebooks yet — create one above.")).toBeTruthy();
});

it("renders the checklist on an empty library WITH a pending tour (below the banner)", () => {
  renderEmptyLibrary({ tourPending: true });
  expect(
    screen.getByText("Your tour continues inside a notebook. Create one or open the demo to see the rest."),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Getting started" })).toBeTruthy();
});
