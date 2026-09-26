// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  listDueCards: vi.fn(),
  getMindmap: vi.fn(),
  downloadMindmap: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});

vi.mock("../sound", () => ({ playSuccess: vi.fn(), isSoundEnabled: vi.fn(() => false) }));

import StudyPanel from "./StudyPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("gives the mind-map Export (.md) button at least a 24px-tall hit area", async () => {
  apiMocks.listCards.mockResolvedValue([]);
  apiMocks.listDueCards.mockResolvedValue([]);
  apiMocks.getMindmap.mockResolvedValue({
    name: "root",
    children: [{ name: "Branch", children: [{ name: "leaf" }] }],
  });
  render(<StudyPanel notebookId="nb-1" onSourcesChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Mind map" }));
  const exportButton = await screen.findByRole("button", { name: /export \(\.md\)/i });
  expect(exportButton.className).toMatch(/min-h-(6|8|11|14)/);
});
