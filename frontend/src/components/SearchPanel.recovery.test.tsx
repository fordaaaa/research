// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const searchMocks = vi.hoisted(() => ({
  onSearch: vi.fn(),
  onImportUrl: vi.fn(),
}));
vi.mock("./ThinkingDots", () => ({
  default: () => <span data-testid="orb" />,
}));
vi.mock("./Spinner", () => ({
  default: () => <span data-testid="spinner" />,
}));

import SearchPanel from "./SearchPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("search zero-results offers Clear search + mode toggle", async () => {
  searchMocks.onSearch.mockResolvedValue([]);
  searchMocks.onImportUrl.mockResolvedValue(undefined);
  render(<SearchPanel onSearch={searchMocks.onSearch} onImportUrl={searchMocks.onImportUrl} />);
  fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
    target: { value: "zzz-no-match" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
  await waitFor(() => expect(searchMocks.onSearch).toHaveBeenCalled());
  expect(await screen.findByRole("button", { name: /clear search/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /search the web instead/i })).toBeTruthy();
});

it("search shows skeleton (not bare spinner text) while searching", async () => {
  let resolveSearch!: (v: []) => void;
  searchMocks.onSearch.mockReturnValue(
    new Promise<[]>((resolve) => {
      resolveSearch = resolve;
    }),
  );
  searchMocks.onImportUrl.mockResolvedValue(undefined);
  render(<SearchPanel onSearch={searchMocks.onSearch} onImportUrl={searchMocks.onImportUrl} />);
  fireEvent.change(screen.getByPlaceholderText("Search your sources…"), {
    target: { value: "cells" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
  expect(await screen.findByTestId("skeleton")).toBeTruthy();
  resolveSearch([]);
});
