// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({ googleStatus: vi.fn().mockResolvedValue({ enabled: false, client_id: null }) }));

import AuthPanel from "./AuthPanel";

afterEach(() => cleanup());

it("shows a clear sign-in form with labels and keeps entered email when switching to registration", () => {
  render(<AuthPanel onAuthed={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Sign in to Notaeo" })).toBeTruthy();
  const email = screen.getByLabelText("Email address") as HTMLInputElement;
  expect(screen.getByLabelText("Password")).toBeTruthy();
  fireEvent.change(email, { target: { value: "student@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
  expect(email.value).toBe("student@example.test");
});
