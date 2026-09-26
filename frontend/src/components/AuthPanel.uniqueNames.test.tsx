// @vitest-environment jsdom
// Round 20 item 3: submit accessible names are EXACTLY the visible text
// ("Create account" / "Sign in") so voice-control users speaking the label
// match. Tab vs submit share adjacent names deliberately; disambiguation
// comes from ROLES (tab vs button) — queries must be role-scoped.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
  getToken: () => window.localStorage.getItem("research_token"),
}));

import AuthPanel from "./AuthPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it("submit name matches its visible text; role-scoped queries stay unique", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  // Register mode: tab and submit share the name — roles disambiguate.
  const tab = screen.getByRole("tab", { name: "Create account" });
  const submit = screen.getByRole("button", { name: "Create account" });
  expect(tab).toBeTruthy();
  expect(submit).toBeTruthy();
  expect(submit.textContent).toMatch(/create account/i);
  expect(submit.getAttribute("aria-label")).toBe("Create account");
});
