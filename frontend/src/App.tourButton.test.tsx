// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
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

it("names the header tour control accessibly (icon '?' is decorative)", async () => {
  window.localStorage.setItem("research_token", "tour-token");
  window.localStorage.setItem("notaeo:onboarding:tour-user", "done");
  apiMocks.me.mockResolvedValue({ id: "tour-user", email: "tour@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const tour = await screen.findByRole("button", { name: "Take a tour" });
  expect(tour.textContent).toMatch(/Tour/);
  // The visible short text carries no semantics; the name comes from aria-label.
  const glyph = tour.querySelector('[aria-hidden="true"]');
  expect(glyph?.textContent).toBe("Tour");
});
