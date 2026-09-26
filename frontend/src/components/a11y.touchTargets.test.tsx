// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  downloadNotebook: vi.fn(),
  googleStatus: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});

const soundMocks = vi.hoisted(() => ({
  playBoot: vi.fn(),
  playSuccess: vi.fn(),
  previewChime: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
}));

vi.mock("../sound", () => soundMocks);

import App from "../App";
import ResearchPanel from "./ResearchPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("round7 item4 44px touch targets", () => {
  it("header brand/home button meets 44px", async () => {
    window.localStorage.removeItem("research_token");
    apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
    render(<App />);
    const home = screen.getByRole("button", { name: "Notaeo home" });
    expect(home.className).toMatch(/min-h-11/);
  });

  it("ResearchPanel Plan button meets 44px", () => {
    render(<ResearchPanel notebookId="n1" aiConfigured={false} onSourcesChanged={vi.fn()} />);
    const plan = screen.getByRole("button", { name: "Plan" });
    expect(plan.className).toMatch(/min-h-11/);
  });

  it("export pill dismiss meets 44px", async () => {
    window.localStorage.setItem("research_token", "pill44-token");
    apiMocks.me.mockResolvedValue({ id: "pill44-user", email: "pill44@example.test" });
    apiMocks.listNotebooks.mockResolvedValue([{ id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]);
    apiMocks.listSources.mockResolvedValue([
      { id: "s1", notebook_id: "book", kind: "txt", title: "Notes", tags: [], meta: {}, created_at: "2026-01-01T00:00:00Z", chunk_count: 1 },
    ]);
    apiMocks.getAISettings.mockResolvedValue({ configured: false });
    apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
    apiMocks.downloadNotebook.mockResolvedValue({ blob: new Blob(), filename: "x.zip" });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
    fireEvent.click(await screen.findByRole("button", { name: /export notebook/i }));
    const dismiss = await screen.findByRole("button", { name: /dismiss export confirmation/i });
    expect(dismiss.className).toMatch(/min-h-11/);
    expect(dismiss.className).toMatch(/min-w-11/);
  });
});
