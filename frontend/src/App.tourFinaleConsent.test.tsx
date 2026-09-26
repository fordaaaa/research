// @vitest-environment jsdom
// Round 24 items 3+4 (FAILING first):
// - landing finale says "Done" (not Next/Finish) + announces "Tour finished"
// - no workspace auto-open post-create; consent banner instead.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  register: vi.fn(),
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
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
  vi.useRealTimers();
  window.localStorage.clear();
});

async function registerToLanding() {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "r24-user", email: "r24@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "nb-1", name: "History", created_at: "2026-01-01T00:00:00Z" });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "r24@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
}

it("landing finale says Done and announces Tour finished", async () => {
  await registerToLanding();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("status", { name: "Tour announcement" }).textContent).toMatch(/tour finished/i);
});

it("no auto-open post-create; consent banner with Resume/Dismiss", async () => {
  vi.useFakeTimers();
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "r24-user", email: "r24@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "nb-1", name: "History", created_at: "2026-01-01T00:00:00Z" });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "r24@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.getByRole("dialog", { name: /looks like you're new here/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await vi.advanceTimersByTimeAsync(100);
  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.queryByRole("dialog")).toBeNull();
  await vi.advanceTimersByTimeAsync(5000);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: /continue the tour/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /resume tour/i }));
  expect(screen.getByRole("dialog", { name: /bring your sources in/i })).toBeTruthy();
});

it("dismissing the consent banner ends the tour", async () => {
  vi.useFakeTimers();
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "r24-user", email: "r24@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "nb-1", name: "History", created_at: "2026-01-01T00:00:00Z" });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "r24@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await vi.advanceTimersByTimeAsync(500);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await vi.advanceTimersByTimeAsync(100);
  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await vi.advanceTimersByTimeAsync(500);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  // Round 25 item 5: the tour unmounts on the next tick after the finale
  // text lands — flush inside act() so the stage commit applies.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(screen.queryByRole("region", { name: /continue the tour/i })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(window.localStorage.getItem("notaeo:onboarding:r24-user")).toBe("done");
});
