// @vitest-environment jsdom
// Round 23 item 7 (lock): the register-path 429 uses the SAME live,
// humanized Retry-After value as login (3599s → "59 minutes"), never a
// static "5 minutes" string.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  vi.useRealTimers();
});

it("register 429 with Retry-After 3599 shows the humanized live value", async () => {
  vi.useFakeTimers();
  window.localStorage.removeItem("research_token");
  vi.mocked(api.register).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), {
      name: "RateLimitError",
      retryAfterSeconds: 3599,
    }),
  );
  render(<AuthPanel onAuthed={vi.fn()} />);
  fireEvent.change(document.getElementById("auth-email") as HTMLInputElement, {
    target: { value: "newstudent@example.test" },
  });
  fireEvent.change(document.getElementById("auth-password") as HTMLInputElement, {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toMatch(/60 minutes/);
  expect(alert.textContent).not.toBe("Too many attempts — try again in 5 minutes");
  // Live: ticks down instead of sitting static.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByRole("alert").textContent).toMatch(/59 minutes/);
});
