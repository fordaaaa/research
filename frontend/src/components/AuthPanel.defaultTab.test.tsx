// @vitest-environment jsdom
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

it("defaults to Create account for new students with no stored token", () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
});

it("defaults to Log in when a session token already exists", () => {
  window.localStorage.setItem("research_token", "returning-token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Sign in to Notaeo" })).toBeTruthy();
});
