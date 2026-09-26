// @vitest-environment jsdom
// Round 12 item 8: the logged-out landing must expose labeled landmarks — one
// around the auth form (always visible, including mobile widths where the
// hero panel is hidden) and one around the hero panel.
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

it("landing exposes labeled landmarks for the auth form and the hero", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);

  // The auth landmark wraps the form and is never breakpoint-gated, so
  // mobile landing keeps a labeled landmark with the hero hidden.
  const auth = screen.getByRole("region", { name: /sign in or create account/i });
  expect(auth.tagName).toBe("SECTION");
  expect(auth.contains(screen.getByRole("tablist", { name: /account options/i }))).toBe(true);

  const hero = screen.getByRole("region", { name: /why notaeo/i });
  expect(hero.tagName).toBe("SECTION");
});
