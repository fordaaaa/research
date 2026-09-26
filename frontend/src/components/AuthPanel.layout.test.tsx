// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }),
  getToken: () => window.localStorage.getItem("research_token"),
}));

import AuthPanel from "./AuthPanel";

afterEach(() => cleanup());

it("leads with account creation and keeps entered email when switching modes", () => {
  render(<AuthPanel onAuthed={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
  const email = screen.getByLabelText("Email address") as HTMLInputElement;
  expect(screen.getByLabelText("Password")).toBeTruthy();
  fireEvent.change(email, { target: { value: "student@example.test" } });
  fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
  expect(screen.getByRole("heading", { name: "Sign in to Notaeo" })).toBeTruthy();
  expect(email.value).toBe("student@example.test");
  fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
  expect(screen.getByRole("heading", { name: "Sign in to Notaeo" })).toBeTruthy();
  expect(email.value).toBe("student@example.test");
  const createTab = screen
    .getAllByRole("tab", { name: "Create account" })
    .find((tab) => tab.hasAttribute("aria-selected"))!;
  fireEvent.click(createTab);
});
