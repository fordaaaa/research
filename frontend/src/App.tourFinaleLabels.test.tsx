// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("tour finales say Done (landing) + Finish (workspace)", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "finale-user", email: "finale@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "nb-finale", name: "History", created_at: "2026-01-01T00:00:00Z" });

  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "finale@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);

  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Landing finale (was "Finish"): round 24 item 3 says "Done".
  expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /explore a notebook/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("status", { name: "Tour announcement" }).textContent).toMatch(/tour finished/i);

  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  // Round 24 item 4: the workspace tour no longer auto-opens — the consent
  // banner gates it. Resume to reach the workspace finale.
  expect(await screen.findByRole("region", { name: /continue the tour/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /resume tour/i }));
  expect(await screen.findByRole("dialog", { name: /bring your sources in/i }, { timeout: 6000 })).toBeTruthy();
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Workspace finale already said "Finish".
  expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
});
