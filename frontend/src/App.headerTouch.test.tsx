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

it("header Settings button meets 44px touch target", async () => {
  window.localStorage.setItem("research_token", "settings-touch-token");
  window.localStorage.setItem("notaeo:onboarding:settings-touch-user", "done");
  apiMocks.me.mockResolvedValue({ id: "settings-touch-user", email: "touch@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const settings = await screen.findByRole("button", { name: "Settings" });
  expect(settings.className).toMatch(/min-h-11/);
});
