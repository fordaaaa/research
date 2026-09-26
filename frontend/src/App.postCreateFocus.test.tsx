// @vitest-environment jsdom
// Round 25 item 7 (FAILING first): post-create focus must land on a NAMED
// control — the paste editor expands first so #paste-title (named input) is
// the target; the labeled add-sources region is the only fallback. Never a
// bare/unnamed DIV (e.g. an unlabelled dropzone).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  createNotebook: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  getProgress: vi.fn(),
  googleStatus: vi.fn(),
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

it("post-create focus is the paste title input or the labeled region, never an unnamed div", async () => {
  window.localStorage.setItem("research_token", "r25i7-token");
  window.localStorage.setItem("notaeo:onboarding:r25i7-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r25i7-user", email: "r25i7@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.getProgress.mockRejectedValue(new Error("no endpoint"));
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.createNotebook.mockResolvedValue({
    id: "nb-new", name: "Chemistry 101", created_at: "2026-01-01T00:00:00Z",
  });

  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/new notebook name/i), {
    target: { value: "Chemistry 101" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

  // The paste editor expands first (old code left it collapsed and parked
  // focus on the card) so the focus target below is the named title input.
  await waitFor(() => expect(screen.getByPlaceholderText("Title")).toBeTruthy());

  await waitFor(() => {
    const active = document.activeElement as HTMLElement | null;
    expect(active, "focus stranded on body").not.toBe(document.body);
    const isTitle = active?.id === "paste-title";
    const isLabeledRegion =
      active?.getAttribute("data-tour") === "add-sources" &&
      !!active?.getAttribute("aria-label");
    expect(isTitle || isLabeledRegion, `focus landed on unnamed node: ${active?.tagName}#${active?.id}`).toBe(true);
    if (active?.tagName === "DIV") {
      expect(active.getAttribute("aria-label"), "bare DIV took focus").toBeTruthy();
    }
  });
});
