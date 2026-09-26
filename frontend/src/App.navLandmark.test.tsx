// @vitest-environment jsdom
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

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("exposes the mobile bottom nav as a labeled landmark", async () => {
  window.localStorage.setItem("research_token", "nav-token");
  apiMocks.me.mockResolvedValue({ id: "nav-user", email: "nav@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const nav = await screen.findByRole("navigation", { name: "Notebook sections" });
  expect(nav.tagName).toBe("NAV");
});
