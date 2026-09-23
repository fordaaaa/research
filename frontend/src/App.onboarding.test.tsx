// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  register: vi.fn(),
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
  createNotebook: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

it("continues the tour after a new user creates a notebook", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "learner", email: "learner@example.test" }, token: "test-token" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "notebook-1", name: "History", created_at: "2026-01-01T00:00:00Z" });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "learner@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("dialog", { name: /start with a notebook/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("dialog", { name: /try the demo/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /explore a notebook/i }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/tour continues inside a notebook/i)).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "History" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByRole("dialog", { name: /bring your sources in/i })).toBeTruthy();
  expect(window.localStorage.getItem("notaeo:onboarding:learner")).toBe("workspace");
});

it("moves to the workspace tour when the highlighted create control is used early", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "early-user", email: "early@example.test" }, token: "test-token" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  apiMocks.createNotebook.mockResolvedValue({ id: "notebook-2", name: "Biology", created_at: "2026-01-01T00:00:00Z" });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "early@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);
  await screen.findByRole("dialog", { name: /looks like you're new here/i });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText(/new notebook name/i), { target: { value: "Biology" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("dialog", { name: /bring your sources in/i })).toBeTruthy();
  expect(window.localStorage.getItem("notaeo:onboarding:early-user")).toBe("workspace");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("starts a spotlight tour after registration and does not show an AI off badge", async () => {
  apiMocks.googleStatus.mockResolvedValue({ enabled: false, client_id: null });
  apiMocks.register.mockResolvedValue({ user: { id: "new-user", email: "new@example.test" }, token: "test-token" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "new@example.test" } });
  fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: "password123" } });
  fireEvent.click(document.querySelector('button[type="submit"]')!);

  expect(await screen.findByRole("dialog", { name: /looks like you're new here/i })).toBeTruthy();
  expect(screen.queryByText("AI off")).toBeNull();
  expect(window.localStorage.getItem("notaeo:onboarding:new-user")).toBe("landing");
  fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.localStorage.getItem("notaeo:onboarding:new-user")).toBe("done");
});

it("does not interrupt a returning user and lets them replay the tour", async () => {
  window.localStorage.setItem("research_token", "returning-token");
  window.localStorage.setItem("notaeo:onboarding:returning-user", "done");
  apiMocks.me.mockResolvedValue({ id: "returning-user", email: "returning@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  await screen.findByText("returning@example.test");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Take a tour" }));
  expect(screen.getByRole("dialog", { name: /looks like you're new here/i })).toBeTruthy();
});
