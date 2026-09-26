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

it("gives the sidebar notebook export link at least a 24px-tall hit area", async () => {
  window.localStorage.setItem("research_token", "export-token");
  apiMocks.me.mockResolvedValue({ id: "export-user", email: "export@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));
  const exportButton = await screen.findByRole("button", { name: /export notebook/i });
  expect(exportButton.className).toMatch(/min-h-(6|8|11|14)/);
});
