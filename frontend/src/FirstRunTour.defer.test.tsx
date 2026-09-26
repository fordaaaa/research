// @vitest-environment jsdom
// Round 22 item 1 (FAILING first): the workspace tour must NOT auto-fire the
// instant the first notebook opens (it steals the "Notebook X created"
// moment). It opens ~2.5s after notebook open; the creation announcement
// lands first. Landing tour still opens immediately.
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

const NOTEBOOK = { id: "notebook-1", name: "History", created_at: "2026-01-01T00:00:00Z" };

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function registerAndFinishLanding() {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "defer-user", email: "defer@example.test" }, token: "t" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue(NOTEBOOK);

  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "defer@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  // Landing tour opens immediately (only promise-flushing needed).
  await advance(500);
  expect(screen.getByRole("dialog", { name: /looks like you're new here/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await advance(100);
  expect(screen.queryByRole("dialog")).toBeNull();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("never auto-opens the workspace tour; consent banner gates it", async () => {
  vi.useFakeTimers();
  await registerAndFinishLanding();

  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await advance(500);

  // Immediately post-create: no tour, but the creation announcement is up.
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status", { name: "Site announcements" }).textContent).toMatch(/Notebook History created/);

  // Round 24 item 4: no deferred auto-open — the banner is up instead and
  // the stage stays "waiting" past the old ~2.5s delay.
  await advance(5000);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: /continue the tour/i })).toBeTruthy();
  expect(window.localStorage.getItem("notaeo:onboarding:defer-user")).toBe("waiting");

  // Resume opens the workspace tour on demand.
  fireEvent.click(screen.getByRole("button", { name: /resume tour/i }));
  expect(screen.getByRole("dialog", { name: /bring your sources in/i })).toBeTruthy();
  expect(window.localStorage.getItem("notaeo:onboarding:defer-user")).toBe("workspace");
});

it("banner survives notebook switches without auto-opening; Dismiss ends the tour", async () => {
  vi.useFakeTimers();
  // Round 25 item 6: "All notebooks" lives in the desktop rail — stub xl.
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      onchange: null,
    }),
  );
  await registerAndFinishLanding();
  apiMocks.listNotebooks.mockResolvedValue([
    NOTEBOOK,
    { id: "notebook-2", name: "Biology", created_at: "2026-01-01T00:00:00Z" },
  ]);

  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await advance(500);
  expect(screen.getByRole("region", { name: /continue the tour/i })).toBeTruthy();

  // Switch notebooks: still no dialog, banner still offered.
  fireEvent.click(screen.getByRole("button", { name: /all notebooks/i }));
  await advance(100);
  fireEvent.click(screen.getByRole("button", { name: "Open Biology" }));
  await advance(2700);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: /continue the tour/i })).toBeTruthy();

  // Dismiss marks the tour done and retires the banner.
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  // Round 25 item 5: the unmount follows on the next tick.
  await advance(100);
  expect(screen.queryByRole("region", { name: /continue the tour/i })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(window.localStorage.getItem("notaeo:onboarding:defer-user")).toBe("done");
});
