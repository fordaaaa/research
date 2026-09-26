// @vitest-environment jsdom
// Round 17 item 8: the landing tour promises a #main-content fallback, but
// the picker repair used to win the race (tour captured the repair-focused
// search box as its trigger). Skipping the tour on landing must end focus
// at #main-content, not the search field.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
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

it("skip tour on landing lands focus at #main-content, not search", async () => {
  window.localStorage.setItem("research_token", "r17i8-token");
  window.localStorage.setItem("notaeo:onboarding:r17i8-user", "landing");
  apiMocks.me.mockResolvedValue({ id: "r17i8-user", email: "r17i8@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  // Tour is up on landing…
  expect(await screen.findByRole("dialog")).toBeTruthy();
  await screen.findByRole("searchbox", { name: "Search notebooks" });

  fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement?.id).toBe("main-content"));
  expect(document.activeElement).not.toBe(
    screen.getByRole("searchbox", { name: "Search notebooks" }),
  );
});
