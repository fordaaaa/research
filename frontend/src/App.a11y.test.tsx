// @vitest-environment jsdom
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

it("names header controls and offers a skip link that focuses main", async () => {
  window.localStorage.removeItem("research_token");
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  const { container } = render(<App />);

  expect(screen.getByRole("button", { name: "Notaeo home" })).toBeTruthy();

  const skip = screen.getByRole("link", { name: /skip to (workspace|content)/i });
  expect(firstTabbable(container)).toBe(skip);

  fireEvent.click(skip);
  const main = document.getElementById("main-content");
  expect(main).toBeTruthy();
  expect(document.activeElement).toBe(main);
});

it("names the Settings control in the tab tour", async () => {
  window.localStorage.setItem("research_token", "a11y-token");
  apiMocks.me.mockResolvedValue({ id: "a11y-user", email: "a11y@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  expect(await screen.findByRole("button", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Notaeo home" })).toBeTruthy();
});

it("keeps focus inside the notebook results after filtering", async () => {
  window.localStorage.setItem("research_token", "a11y-token");
  apiMocks.me.mockResolvedValue({ id: "a11y-user", email: "a11y@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([
    { id: "biology", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
    { id: "history", name: "History", created_at: "2026-01-02T00:00:00Z" },
  ]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const search = await screen.findByRole("searchbox", { name: "Search notebooks" });
  (search as HTMLInputElement).focus();
  fireEvent.change(search, { target: { value: "bio" } });

  expect(screen.getByRole("button", { name: "Open Biology" })).toBeTruthy();
  expect(document.activeElement).toBe(search);
});
