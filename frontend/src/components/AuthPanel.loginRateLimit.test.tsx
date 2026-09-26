// @vitest-environment jsdom
// Round 13 item 8 (UI): a 429 from login renders "Too many attempts — try
// again in Ns" using the retry_after carried on the api error.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

it("login 429 renders the retry message with seconds", async () => {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.login).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), { name: "RateLimitError", retryAfterSeconds: 45 }),
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
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too many attempts/i));
  expect(screen.getByRole("alert").textContent).toMatch(/45/);
});

it("login 429 with a long wait renders minutes, not raw seconds", async () => {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.login).mockRejectedValue(
    Object.assign(new Error("Too many attempts"), { name: "RateLimitError", retryAfterSeconds: 298 }),
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
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/5 minutes/));
});
