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

it("landing exposes hero + checklist landmarks", async () => {
  window.localStorage.setItem("research_token", "lm10-token");
  apiMocks.me.mockResolvedValue({ id: "lm10-user", email: "lm10@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  await screen.findByPlaceholderText(/new notebook name/i);
  const regions = screen.getAllByRole("region");
  const names = regions.map((region) => region.getAttribute("aria-label") ?? "");
  expect(names.some((name) => /librar|welcome|intro/i.test(name))).toBe(true);
  expect(names.some((name) => /getting started|checklist/i.test(name))).toBe(true);
  // Checklist still reachable from the landing page.
  fireEvent.click(screen.getByRole("button", { name: /create or open a notebook/i }));
  expect(document.activeElement).toBe(screen.getByPlaceholderText(/new notebook name/i));
});
