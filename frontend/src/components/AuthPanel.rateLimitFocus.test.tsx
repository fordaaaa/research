// @vitest-environment jsdom
// Round 15 item 4: on 429 the role=alert message receives focus.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
    getToken: () => window.localStorage.getItem("research_token"),
    login: vi.fn(),
  };
});

import * as api from "../api";
import AuthPanel from "./AuthPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

it("429 moves focus to the alert message", async () => {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.login).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), {
      name: "RateLimitError",
      retryAfterSeconds: 45,
    }),
  );
  render(<AuthPanel onAuthed={vi.fn()} />);
  fireEvent.change(document.getElementById("auth-email") as HTMLInputElement, {
    target: { value: "student@example.test" },
  });
  fireEvent.change(document.getElementById("auth-password") as HTMLInputElement, {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/too many attempts/i);
  expect(alert.textContent).toMatch(/45 seconds/);
  expect(alert.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).toBe(alert);
});
