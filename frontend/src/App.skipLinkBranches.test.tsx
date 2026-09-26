// @vitest-environment jsdom
// Round 15 item 5: skip link is the first tabbable element in every branch.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

function firstTabbable(root: HTMLElement): Element | null {
  const candidates = root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  return candidates.item(0) ?? null;
}

function expectSkipFirst(container: HTMLElement) {
  const skip = screen.getByRole("link", { name: /skip to workspace/i });
  expect(firstTabbable(container)).toBe(skip);
}

it("loading branch: skip link is first tabbable", () => {
  window.localStorage.setItem("research_token", "skip-token");
  apiMocks.me.mockReturnValue(new Promise(() => {}));
  const { container } = render(<App />);
  expectSkipFirst(container);
});

it("auth branch: skip link is first tabbable", async () => {
  window.localStorage.removeItem("research_token");
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  const { container } = render(<App />);
  await screen.findByRole("tab", { name: "Log in" });
  expectSkipFirst(container);
});

it("landing branch: skip link is first tabbable", async () => {
  window.localStorage.setItem("research_token", "skip-token");
  apiMocks.me.mockResolvedValue({ id: "skip-user", email: "skip@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  const { container } = render(<App />);
  await screen.findByRole("searchbox", { name: "Search notebooks" });
  expectSkipFirst(container);
});

it("workspace branch: skip link is first tabbable", async () => {
  window.localStorage.setItem("research_token", "skip-token");
  apiMocks.me.mockResolvedValue({ id: "skip-user", email: "skip@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "nb1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  const { container } = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  await screen.findByRole("button", { name: /paste text instead/i });
  expectSkipFirst(container);
});
