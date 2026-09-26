// @vitest-environment jsdom
// Round 22 item 8 (FAILING first): the register 429 "try again in …" message
// must tick down live each second from Retry-After (not sit static), with a
// reassurance line that the user is not locked out.
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

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function triggerRegister429(retryAfterSeconds: number) {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.register).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), {
      name: "RateLimitError",
      retryAfterSeconds,
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
  await advance(100);
}

it("register 429 counts down live and reassures", async () => {
  vi.useFakeTimers();
  await triggerRegister429(125);

  const alert = screen.getByRole("alert");
  expect(alert.textContent).toMatch(/2 minutes/);
  expect(document.activeElement).toBe(alert);
  // Reassurance: not locked out, just waiting.
  expect(screen.getByText(/you're not locked out/i)).toBeTruthy();

  // Ticks down as seconds elapse.
  await advance(60_000);
  expect(screen.getByRole("alert").textContent).toMatch(/1 minute/);
  expect(screen.getByRole("alert").textContent).not.toMatch(/2 minutes/);
  expect(screen.getByText(/you're not locked out/i)).toBeTruthy();

  await advance(60_000);
  expect(screen.getByRole("alert").textContent).toMatch(/5 seconds/);

  await advance(5_000);
  expect(screen.getByRole("alert").textContent).toMatch(/try again now/i);
});

it("long register wait starts at 59 minutes and decrements", async () => {
  vi.useFakeTimers();
  await triggerRegister429(3540);

  expect(screen.getByRole("alert").textContent).toMatch(/59 minutes/);
  await advance(60_000);
  expect(screen.getByRole("alert").textContent).toMatch(/58 minutes/);
});
