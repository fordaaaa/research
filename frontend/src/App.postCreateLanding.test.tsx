// @vitest-environment jsdom
// Round 14 item 2 (updated round 17): after creating a notebook the user
// lands on the Library/sources pane — mobileSection library — with focus on
// the add-source entry control (the checklist's "add a source" step).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  createNotebook: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
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

it("after create, selects library context and brings sources heading into view", async () => {
  window.localStorage.setItem("research_token", "r14i2-token");
  window.localStorage.setItem("notaeo:onboarding:r14i2-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r14i2-user", email: "r14i2@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb-new", name: "Physics 101", created_at: "2026-01-01T00:00:00Z",
  });
  const scrolledEls: Element[] = [];
  window.HTMLElement.prototype.scrollIntoView = function (this: Element) {
    scrolledEls.push(this);
  } as unknown as typeof window.HTMLElement.prototype.scrollIntoView;

  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Physics 101" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

  // Library context is selected and the add-source entry control is the
  // visible/focused landing target. Strict: the add-sources card must be
  // scrolled into view and focus must land inside it — the sources list
  // heading alone is no longer enough (round 17: checklist points at adding).
  await screen.findByRole("heading", { name: /^sources$/i });
  await waitFor(() => {
    const card = document.querySelector('[data-tour="add-sources"]');
    expect(card, "add-sources card missing").toBeTruthy();
    const focusedInside = card!.contains(document.activeElement);
    const scrolledEntry = scrolledEls.some(
      (el) =>
        el === card ||
        (el instanceof Element && el.closest?.('[data-tour="add-sources"]') !== null),
    );
    expect(scrolledEntry || focusedInside).toBe(true);
  });
  await waitFor(() =>
    expect(
      document.querySelector('[data-tour="add-sources"]')?.contains(document.activeElement),
    ).toBe(true),
  );
});
