// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  listDueCards: vi.fn(),
  listCardSuggestions: vi.fn(),
  getGuide: vi.fn(),
  getMindmap: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});
vi.mock("./ThinkingDots", () => ({
  default: () => <span data-testid="orb" />,
}));
vi.mock("./Spinner", () => ({
  default: () => <span data-testid="spinner" />,
}));

import StudyPanel from "./StudyPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("study-guide builder shows spinner (not orb) while building", async () => {
  apiMocks.listCards.mockResolvedValue([]);
  apiMocks.listDueCards.mockResolvedValue([]);
  let resolveGuide!: (v: unknown) => void;
  apiMocks.getGuide.mockReturnValue(
    new Promise((resolve) => {
      resolveGuide = resolve;
    }),
  );
  render(<StudyPanel notebookId="nb-1" onSourcesChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Study guide" }));
  fireEvent.click(screen.getByRole("button", { name: /build guide/i }));
  await waitFor(() => expect(apiMocks.getGuide).toHaveBeenCalled());
  expect(screen.getByTestId("spinner")).toBeTruthy();
  expect(screen.queryByTestId("orb")).toBeNull();
  resolveGuide({ markdown: "done" });
});
