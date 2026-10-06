// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  addPaste: vi.fn(),
  search: vi.fn(),
  listCards: vi.fn(),
  listDueCards: vi.fn(),
  reviewCard: vi.fn(),
  downloadNotebook: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

const soundMocks = vi.hoisted(() => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

vi.mock("./sound", () => soundMocks);

import App from "./App";

const NOTEBOOK = { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" };
const SOURCE = {
  id: "s1",
  notebook_id: "book",
  kind: "paste",
  title: "Mitosis Notes",
  tags: [],
  meta: {},
  created_at: "2026-01-01T00:00:00Z",
  chunk_count: 1,
};
const CARD = {
  id: "c1",
  notebook_id: "book",
  front: "What splits in anaphase?",
  back: "Sister chromatids",
  tags: [],
  review_count: 0,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("wires the full checklist chain: source → search → grade → 4 of 4", async () => {
  // Round 25 item 6: the workspace rail only mounts at xl — stub an xl
  // viewport (mobile jsdom default would leave it unmounted).
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      onchange: null,
    }),
  );
  window.localStorage.setItem("research_token", "chain-token");
  apiMocks.me.mockResolvedValue({ id: "chain-user", email: "chain@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.addPaste.mockResolvedValue(SOURCE);
  apiMocks.search.mockResolvedValue([
    {
      source_id: "s1",
      source_title: "Mitosis Notes",
      pages: [1],
      score: 3,
      snippet: "cells divide",
      matched_terms: ["cells"],
    },
  ]);
  apiMocks.listCards.mockResolvedValue([CARD]);
  apiMocks.listDueCards.mockResolvedValue([CARD]);
  apiMocks.reviewCard.mockImplementation(async (_nb: string, id: string) => ({
    ...CARD,
    id,
    review_count: 1,
  }));
  apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /paste text instead/i });

  // 1. Add a source → hasAddedSource.
  apiMocks.listSources.mockResolvedValue([SOURCE]);
  fireEvent.click(screen.getByRole("button", { name: /paste text instead/i }));
  fireEvent.change(screen.getByPlaceholderText("Paste your text here…"), {
    target: { value: "Cells divide in mitosis daily" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save source/i }));
  await waitFor(() => expect(apiMocks.addPaste).toHaveBeenCalled());

  // 2. Real search → hasSearched (the Search *view* on the workspace rail;
  // the mobile bottom nav has a same-named section button).
  const rail = screen.getByRole("navigation", { name: "Workspace tools" });
  fireEvent.click(within(rail).getByRole("button", { name: "Search" }));
  const input = await screen.findByPlaceholderText(/search your sources/i);
  fireEvent.change(input, { target: { value: "cells" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(apiMocks.search).toHaveBeenCalledWith("book", "cells", expect.any(AbortSignal)));
  await screen.findByText("cells divide");

  // 3. Real grade → hasExportedOrReviewed (the Study view, not the
  // same-named mobile section button).
  fireEvent.click(within(rail).getByRole("button", { name: "Study" }));
  fireEvent.click(await screen.findByRole("button", { name: /review due/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  await waitFor(() => expect(apiMocks.reviewCard).toHaveBeenCalledWith("book", "c1", "good"));

  // 4. Back on landing, the checklist celebrates the full loop.
  fireEvent.click(screen.getByRole("button", { name: /all notebooks/i }));
  expect(await screen.findByText("All done ✓")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("4");
});
