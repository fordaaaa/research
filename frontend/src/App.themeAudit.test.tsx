// @vitest-environment jsdom
// Round 19 item 1 (FAILING first): audit EVERY appearance-change path.
// Theme buttons, font buttons must announce in the App-level region;
// initial load must stay silent; repeat selection must re-announce.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
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
});

function bootAuthed(userId: string) {
  window.localStorage.setItem("research_token", `${userId}-token`);
  window.localStorage.setItem(`notaeo:onboarding:${userId}`, "done");
  apiMocks.me.mockResolvedValue({ id: userId, email: `${userId}@example.test` });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
}

it("initial load stays silent in the App-level appearance region", async () => {
  bootAuthed("r19i1-silent");
  render(<App />);
  await screen.findByRole("button", { name: "Settings" });
  const live = screen.getByRole("status", { name: "Appearance announcement" });
  expect(live.textContent ?? "").toBe("");
});

it("font change announces in the App-level region", async () => {
  bootAuthed("r19i1-font");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(await screen.findByRole("button", { name: "Maple Mono" }));
  const live = await screen.findByRole("status", { name: "Appearance announcement" });
  expect(live.textContent ?? "").toMatch(/maple mono font on/i);
});

it("repeat selection stays silent (no re-announce on identical theme)", async () => {
  bootAuthed("r19i1-repeat");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  const ocean = await screen.findByRole("button", { name: "Ocean" });
  fireEvent.click(ocean);
  const live = await screen.findByRole("status", { name: "Appearance announcement" });
  expect(live.textContent ?? "").toMatch(/ocean theme on/i);
  // Round 24 item 2: clicking the already-selected theme is a silent no-op —
  // no live-region mutation, text unchanged. (Supersedes the old
  // repeat-re-announces expectation: repeats are noise, not signal.)
  let mutations = 0;
  const observer = new MutationObserver(() => {
    mutations += 1;
  });
  observer.observe(live, { childList: true, characterData: true, subtree: true });
  fireEvent.click(ocean);
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  observer.disconnect();
  expect(mutations).toBe(0);
  expect(screen.getByRole("status", { name: "Appearance announcement" }).textContent ?? "").toMatch(
    /ocean theme on/i,
  );
});
