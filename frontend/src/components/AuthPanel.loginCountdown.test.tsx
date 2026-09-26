// @vitest-environment jsdom
// Item 6 (lock): the login 429 path must show the SAME live countdown as
// the register path (both flow through the shared submit()). Register is
// covered in round22.item8; this locks login parity: identical message
// shape, live tick-down, focus on the alert, and the reassurance line.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
    getToken: () => "existing-token",
    login: vi.fn(),
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

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("login 429 counts down live exactly like the register path", async () => {
  vi.useFakeTimers();
  window.localStorage.setItem("research_token", "existing-token");
  vi.mocked(api.login).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), {
      name: "RateLimitError",
      retryAfterSeconds: 125,
    }),
  );
  render(<AuthPanel onAuthed={vi.fn()} />);
  fireEvent.change(document.getElementById("auth-email") as HTMLInputElement, {
    target: { value: "student@example.test" },
  });
  fireEvent.change(document.getElementById("auth-password") as HTMLInputElement, {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await advance(100);

  const alert = screen.getByRole("alert");
  expect(alert.textContent).toMatch(/2 minutes/);
  expect(document.activeElement).toBe(alert);
  expect(screen.getByText(/you're not locked out/i)).toBeTruthy();

  await advance(60_000);
  expect(screen.getByRole("alert").textContent).toMatch(/1 minute/);
  expect(screen.getByText(/you're not locked out/i)).toBeTruthy();

  await advance(60_000);
  expect(screen.getByRole("alert").textContent).toMatch(/5 seconds/);

  await advance(5_000);
  expect(screen.getByRole("alert").textContent).toMatch(/try again now/i);
});
