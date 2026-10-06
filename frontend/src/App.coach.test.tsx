// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Notebook } from "./api";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(), listNotebooks: vi.fn(), listSources: vi.fn(),
  getAISettings: vi.fn(), getHostedAIStatus: vi.fn(), getProgress: vi.fn(),
}));
vi.mock("./api", async () => ({ ...await vi.importActual<typeof import("./api")>("./api"), ...apiMocks }));
vi.mock("./components/HomeDashboard", () => ({ default: ({ notebooks, onOpenCoach }: {
  notebooks: Notebook[]; onOpenCoach?: (notebook: Notebook) => void;
}) => onOpenCoach && notebooks[0] ? <button onClick={() => onOpenCoach(notebooks[0])}>Plan exam revision</button> : null }));
vi.mock("./sound", () => ({ playBoot: vi.fn(), playSuccess: vi.fn(), isSoundEnabled: () => false }));
import App from "./App";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });

it("opens the home exam action in the coach after the notebook load completes", async () => {
  localStorage.setItem("research_token", "test-token");
  localStorage.setItem("notaeo:onboarding:coach-user", "done");
  apiMocks.me.mockResolvedValue({ id: "coach-user", email: "coach@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "biology", name: "Biology", created_at: "2026-10-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockResolvedValue({ enabled: false });
  apiMocks.getProgress.mockResolvedValue({ source: false, search: false, export: false, review: false });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ goal: null, sessions: [] }), { status: 200 })));
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Plan exam revision" }));

  await waitFor(() => expect(apiMocks.listSources).toHaveBeenCalledTimes(1));
  const coach = within(screen.getByRole("navigation", { name: "Workspace tools" })).getByRole("button", { name: "Exam coach" });
  await waitFor(() => expect(coach.getAttribute("aria-current")).toBe("page"));
});
