// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  listNotes: vi.fn(),
  me: vi.fn(),
  getAISettings: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

const NOTEBOOK = { id: "nb1", name: "Biology 101", created_at: "2026-01-01T00:00:00Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("App mobile notes parity", () => {
  it("keeps the notes editor reachable when the Notes view maps to the library section", async () => {
    window.localStorage.setItem("research_token", "test-token");
    apiMocks.me.mockResolvedValue({ id: "u1", email: "student@example.test" });
    apiMocks.listNotebooks.mockResolvedValue([NOTEBOOK]);
    apiMocks.getAISettings.mockResolvedValue({ configured: false, provider: null, model: null });
    apiMocks.listSources.mockResolvedValue([]);
    apiMocks.listNotes.mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /open biology 101/i }));
    const main = await screen.findByRole("main");
    fireEvent.click(within(main).getByRole("tab", { name: "Notes" }));

    await waitFor(() => {
      const aside = document.querySelector("aside") as HTMLElement | null;
      expect(aside).not.toBeNull();
      expect(within(aside!).queryByText("Notebook notes")).not.toBeNull();
    });
  });
});
