// @vitest-environment jsdom
// Round 23 item 6 (lock): manual "Take a tour" open passes the trigger through
// startTour, so Esc restores focus to the Take-a-tour button. Auto-opened
// tours (trigger null) fall back to #main-content (covered at component level
// by round20.item1.triggerRestore; asserted here at App level via the initial
// null trigger path is impractical — the component contract is the lock).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("manual tour open + Esc restores focus to the Take-a-tour button", async () => {
  window.localStorage.setItem("research_token", "r23i6-token");
  window.localStorage.setItem("notaeo:onboarding:r23i6-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r23i6-user", email: "r23i6@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  const tourButton = await screen.findByRole("button", { name: "Take a tour" });
  fireEvent.click(tourButton);
  expect(await screen.findByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  // Round 25 item 5: the finale text lands first, the unmount (and its
  // focus restore) follows on the next tick.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(tourButton);
});
