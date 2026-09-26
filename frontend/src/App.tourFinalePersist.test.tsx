// @vitest-environment jsdom
// Item 2 (FAILING first): audit locks for the persistent tour-finale region.
// (a) The finale text must survive UNRELATED later actions (a search, a
// notebook switch, a source delete) — the win-rotation clearers
// (markSearched / notebook-effect / handleSourceDeleted) must never wipe
// the tour region. (b) A repeat tour finale must re-announce: setting the
// identical string twice bails out of useState with no DOM mutation, so AT
// hears nothing the second time — the announcer clears-then-resets.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  register: vi.fn(),
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
  googleStatus: vi.fn(),
  createNotebook: vi.fn(),
  search: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

vi.mock("./sound", () => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.useRealTimers();
});

function tourRegionText(): string {
  return screen.getByRole("status", { name: "Tour announcement" }).textContent ?? "";
}

async function finishLandingTour() {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "fin-user", email: "fin@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "fin@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(tourRegionText()).toMatch(/tour finished/i);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(tourRegionText()).toMatch(/tour finished/i);
}

it("finale text survives an unrelated notebook switch after unmount", async () => {
  await finishLandingTour();
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z",
  });
  // Unrelated action: create + open a notebook (the notebook-switch
  // clearer retires notice/saveAnnouncement here)…
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Biology" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
  await screen.findByRole("region", { name: "Continue the tour?" });
  // …the tour region still carries the finale.
  expect(tourRegionText()).toMatch(/tour finished/i);
});

it("banner Dismiss after landing Done re-announces (DOM mutation, not a bailed-out setState)", async () => {
  await finishLandingTour();
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z",
  });
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Biology" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
  await screen.findByRole("region", { name: "Continue the tour?" });
  // The region already reads "Tour finished" from the landing Done — the
  // banner Dismiss is a same-text finale. Observe from here: a plain
  // setState bails with zero mutations and SR hears nothing.
  const region = screen.getByRole("status", { name: "Tour announcement" });
  const mutations: string[] = [];
  const observer = new MutationObserver(() => mutations.push(region.textContent ?? ""));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(tourRegionText()).toMatch(/tour finished/i));
  observer.disconnect();
  // A real clear-then-reset mutation pair — an identical-text setState alone
  // produces zero mutations and SR hears nothing.
  expect(mutations.length).toBeGreaterThan(0);
});
