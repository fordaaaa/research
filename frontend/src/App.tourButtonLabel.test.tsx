// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

it("mobile tour control shows short text with the accessible name intact", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  window.localStorage.setItem("research_token", "tour10-token");
  window.localStorage.setItem("notaeo:onboarding:tour10-user", "done");
  apiMocks.me.mockResolvedValue({ id: "tour10-user", email: "tour10@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const tour = await screen.findByRole("button", { name: "Take a tour" });
  // Decided form: short "Tour" text on mobile (accessible name intact via aria-label).
  expect(tour.textContent).toMatch(/Tour/);
});
