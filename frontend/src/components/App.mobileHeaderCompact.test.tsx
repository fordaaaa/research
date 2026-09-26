// @vitest-environment jsdom
// Round 13 item 4: 390px compact pass — tighter header gaps/padding and a
// smaller hero band on mobile, while keeping 44px targets and visible names.
// jsdom cannot measure pixels, so assert the responsive classes.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
  googleStatus: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, ...apiMocks };
});
import App from "../App";
import NotebookPicker from "./NotebookPicker";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

it("header uses compact mobile gaps/padding with full targets and names", async () => {
  window.localStorage.setItem("research_token", "compact-header-token");
  window.localStorage.setItem("notaeo:onboarding:compact-header-user", "done");
  apiMocks.me.mockResolvedValue({ id: "compact-header-user", email: "compact@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));

  render(<App />);
  const settings = await screen.findByRole("button", { name: "Settings" });
  const header = settings.closest("header")!;
  // Compact on mobile, roomier from sm up.
  expect(header.className).toMatch(/gap-1\.5/);
  expect(header.className).toMatch(/sm:gap-3/);
  expect(header.className).toMatch(/px-3/);
  // 44px targets and names survive the compact pass.
  expect(settings.className).toMatch(/min-h-11/);
  expect(screen.getByRole("button", { name: "Take a tour" }).className).toMatch(/min-h-11/);
  expect(screen.getByRole("button", { name: "Take a tour" }).textContent).toMatch(/Tour/);
});

it("landing hero band uses smaller mobile padding", () => {
  render(
    <NotebookPicker
      notebooks={[]}
      onOpen={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  const hero = screen.getByRole("heading", { name: /Your books, notes, and questions\./ }).closest("section")!;
  expect(hero.className).toMatch(/px-5/);
  expect(hero.className).toMatch(/py-7/);
  expect(hero.className).toMatch(/sm:px-12/);
  expect(hero.className).toMatch(/sm:py-12/);
});
