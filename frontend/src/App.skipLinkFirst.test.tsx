// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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

function firstTabbable(root: HTMLElement): Element | null {
  return (
    root.querySelector(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ) ?? null
  );
}

describe("round7 item7 skip link first", () => {
  it("landing with notebooks: first Tab lands on the skip link", async () => {
    window.localStorage.setItem("research_token", "skip-token");
    apiMocks.me.mockResolvedValue({ id: "skip-user", email: "skip@example.test" });
    apiMocks.listNotebooks.mockResolvedValue([
      { id: "n1", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
    ]);
    apiMocks.listSources.mockResolvedValue([]);
    apiMocks.getAISettings.mockResolvedValue({ configured: false });
    apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

    const { container } = render(<App />);
    await screen.findByRole("button", { name: "Open Biology" });
    const skip = screen.getByRole("link", { name: /skip to (workspace|content)/i });
    expect(firstTabbable(container)).toBe(skip);
  });
});
