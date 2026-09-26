// @vitest-environment jsdom
// Round 25 item 5 (FAILING first): the finale text must land in the
// App-PERSISTENT tour announcement region BEFORE the tour unmounts (text
// first, unmount on the next tick) — and survive the unmount. Covers both
// finales: landing "Done" and workspace "Finish".
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  register: vi.fn(),
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
  googleStatus: vi.fn(),
  createNotebook: vi.fn(),
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

function tourRegionText(): string {
  return screen.getByRole("status", { name: "Tour announcement" }).textContent ?? "";
}

it("landing Done writes the persistent finale text before the tour unmounts", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "r25i5-user", email: "r25i5@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "r25i5@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  // Text lands immediately…
  expect(tourRegionText()).toMatch(/tour finished/i);
  // …while the tour is still mounted (unmount follows on the next tick)…
  expect(screen.queryByRole("dialog")).toBeTruthy();
  // …and the text survives the unmount.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(tourRegionText()).toMatch(/tour finished/i);
});

it("workspace Finish writes the persistent finale text before the tour unmounts", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "r25i5w-user", email: "r25i5w@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  apiMocks.createNotebook.mockResolvedValue({ id: "nb-1", name: "History", created_at: "2026-01-01T00:00:00Z" });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "r25i5w@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  fireEvent.click(await screen.findByRole("button", { name: /resume tour/i }));
  await screen.findByRole("dialog", { name: /bring your sources in/i });
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(tourRegionText()).toMatch(/tour finished/i);
  expect(screen.queryByRole("dialog")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(tourRegionText()).toMatch(/tour finished/i);
});
