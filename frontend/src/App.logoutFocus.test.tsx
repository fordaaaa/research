// @vitest-environment jsdom
// Round 17 item 6 (logout): the logout re-render stranded focus on BODY —
// it moves to the auth screen's #main-content instead.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
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

it("moves focus to the auth #main-content on logout", async () => {
  window.localStorage.setItem("research_token", "r17i6-token");
  window.localStorage.setItem("notaeo:onboarding:r17i6-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r17i6-user", email: "r17i6@example.test" });
  apiMocks.logout.mockResolvedValue(undefined);
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /log out r17i6@example.test/i }));
  await screen.findByRole("tab", { name: "Log in" });
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  expect(document.activeElement?.id).toBe("main-content");
});
