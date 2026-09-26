// @vitest-environment jsdom
// Round 21 item 8 (FAILING first): a duplicate-register 200-generic
// `{registered: false, detail}` (no session) shows the message, offers a
// one-click switch to the login tab with the email prefilled, and is NEVER
// treated as authed (no token stored, onAuthed not called).
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const DUPLICATE_DETAIL = "If an account exists for this email, try logging in instead.";

async function submitDuplicate(onAuthed = vi.fn()) {
  window.localStorage.removeItem("research_token");
  vi.mocked(api.register).mockResolvedValue({
    registered: false,
    detail: DUPLICATE_DETAIL,
  } as unknown as { user: { id: string; email: string }; token: string });
  render(<AuthPanel onAuthed={onAuthed} />);
  fireEvent.change(document.getElementById("auth-email") as HTMLInputElement, {
    target: { value: "taken@example.test" },
  });
  fireEvent.change(document.getElementById("auth-password") as HTMLInputElement, {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  return onAuthed;
}

it("shows the duplicate message without logging in", async () => {
  const onAuthed = await submitDuplicate();
  expect(await screen.findByText(DUPLICATE_DETAIL)).toBeTruthy();
  expect(onAuthed).not.toHaveBeenCalled();
  expect(window.localStorage.getItem("research_token")).toBeNull();
});

it("offers a one-click switch to the login tab with the email prefilled", async () => {
  await submitDuplicate();
  await screen.findByText(DUPLICATE_DETAIL);
  fireEvent.click(screen.getByRole("button", { name: /log in instead/i }));
  expect(screen.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected")).toBe("true");
  expect((document.getElementById("auth-email") as HTMLInputElement).value).toBe("taken@example.test");
});
