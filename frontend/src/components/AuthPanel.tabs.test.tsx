// @vitest-environment jsdom
// Round 12 item 5: the mode switch must read as real tabs (tablist/tab +
// aria-selected) so AT users perceive tabs vs. the submit action. Round 20
// item 3: the submit name is exactly its visible text — tab vs submit share
// adjacent names deliberately and disambiguate by ROLE, so queries below are
// role-scoped (getByRole('tab') vs getByRole('button')).
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

it("exposes the mode switch as a tablist with selected tabs and unique names", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);

  const tablist = screen.getByRole("tablist", { name: /account options/i });
  expect(tablist).toBeTruthy();
  const loginTab = screen.getByRole("tab", { name: "Log in" });
  const createTab = screen.getByRole("tab", { name: "Create account" });
  // New students land on the Create account tab.
  expect(createTab.getAttribute("aria-selected")).toBe("true");
  expect(loginTab.getAttribute("aria-selected")).toBe("false");

  fireEvent.click(loginTab);
  expect(loginTab.getAttribute("aria-selected")).toBe("true");
  expect(createTab.getAttribute("aria-selected")).toBe("false");
  expect(screen.getByRole("heading", { name: "Sign in to Notaeo" })).toBeTruthy();

  // The submit name matches its visible text; roles disambiguate tab vs button.
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  fireEvent.click(createTab);
  expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
});
