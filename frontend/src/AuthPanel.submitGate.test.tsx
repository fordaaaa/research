// @vitest-environment jsdom
// Round 20 item 4 (FAILING first): submit disabled derives SOLELY from
// synchronous input state; async GIS/client-id fetch must never gate it.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", () => ({
  googleStatus: vi.fn().mockImplementation(() => new Promise(() => {})),
  getToken: () => null,
}));

// NOTE: path is components/ relative to src root file.
import AuthPanel from "./components/AuthPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it("submit enabled/disabled is deterministic from inputs alone (no async dependency)", async () => {
  window.localStorage.removeItem("research_token");
  render(<AuthPanel onAuthed={vi.fn()} />);
  const submit = screen.getByRole("button", { name: "Create account" });
  // Empty inputs → disabled with the reason hint.
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Enter email and password to continue.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@example.test" } });
  // Password still empty → still disabled even though async googleStatus never resolves.
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough" } });
  await vi.waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  // Clearing email re-disables synchronously.
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "" } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
});
