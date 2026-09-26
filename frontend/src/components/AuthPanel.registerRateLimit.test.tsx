// @vitest-environment jsdom
// Round 21 item 7 (audit lock): a 429 from REGISTER renders the same
// humanized retry message + focus pattern as the Round-13 login 429 UX.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
    getToken: () => window.localStorage.getItem("research_token"),
    register: vi.fn(),
  };
});

import * as api from "../api";
import AuthPanel from "./AuthPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

it("register 429 renders the humanized retry message and focuses the alert", async () => {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.register).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), {
      name: "RateLimitError",
      retryAfterSeconds: 45,
    }),
  );
  render(<AuthPanel onAuthed={vi.fn()} />);
  fireEvent.change(document.getElementById("auth-email") as HTMLInputElement, {
    target: { value: "newstudent@example.test" },
  });
  fireEvent.change(document.getElementById("auth-password") as HTMLInputElement, {
    target: { value: "password123" },
  });
  // Default tab with no stored token is "Create account" (register mode).
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/too many attempts/i);
  expect(alert.textContent).toMatch(/45 seconds/);
  expect(alert.getAttribute("tabindex")).toBe("-1");
  await waitFor(() => expect(document.activeElement).toBe(alert));
});
