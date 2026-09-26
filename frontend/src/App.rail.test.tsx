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

it("gives the xl workspace rails room: widened rails, grid intact", async () => {
  window.localStorage.setItem("research_token", "rail-token");
  apiMocks.me.mockResolvedValue({ id: "rail-user", email: "rail@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "book", name: "Biology", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Biology" }));

  const workspace = document.querySelector(".mx-auto.grid");
  expect(workspace).toBeTruthy();
  const cls = workspace!.className;
  // Three-column xl grid intact (nav / main / source library).
  expect(cls).toMatch(/xl:grid-cols-\[/);
  // The crushed 215px nav rail is widened into the 215–280px range and the
  // 300px source rail is widened so titles are not crushed to one letter.
  expect(cls).toContain("240px");
  expect(cls).toContain("340px");
  expect(cls).not.toContain("215px");
});
