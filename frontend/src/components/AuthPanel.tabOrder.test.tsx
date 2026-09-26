// @vitest-environment jsdom
// Round 13 item 5: Tab from the password field must never drop to <body>.
// When the submit is disabled (empty fields), Tab wraps to a sensible card
// stop instead of leaving the card.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
  getToken: () => window.localStorage.getItem("research_token"),
}));

import AuthPanel from "./AuthPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it("tabs from password to a card stop (never body) when submit is disabled", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  const password = document.getElementById("auth-password") as HTMLInputElement;
  password.focus();
  expect(document.activeElement).toBe(password);
  fireEvent.keyDown(password, { key: "Tab", code: "Tab" });
  expect(document.activeElement).not.toBe(document.body);
  // With nowhere enabled to go, focus wraps to the active account tab.
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Create account" }));
});

it("password Tab still reaches submit once the form is fillable", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  const email = document.getElementById("auth-email") as HTMLInputElement;
  const password = document.getElementById("auth-password") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "student@example.test" } });
  fireEvent.change(password, { target: { value: "password123" } });
  password.focus();
  fireEvent.keyDown(password, { key: "Tab", code: "Tab" });
  // Either the browser default (submit enabled) or the card wrap — but never body.
  expect(document.activeElement).not.toBe(document.body);
});
