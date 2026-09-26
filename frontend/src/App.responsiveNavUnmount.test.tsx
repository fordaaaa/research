// @vitest-environment jsdom
// Round 25 item 6 (FAILING first): the off-breakpoint nav bar must be truly
// UNMOUNTED, not merely hidden+inert — exactly one section nav
// ("Workspace tools" desktop rail XOR "Notebook sections" mobile bottom bar)
// is mounted per viewport, so duplicate names never coexist.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  listNotebooks: vi.fn(),
  listSources: vi.fn(),
  getAISettings: vi.fn(),
  getHostedAIStatus: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...apiMocks };
});

import App from "./App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function mockViewport(width: number) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => {
      const minWidth = query.match(/min-width:\s*(\d+)px/);
      const matches = minWidth ? width >= Number.parseInt(minWidth[1], 10) : false;
      return {
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        onchange: null,
      };
    },
  );
}

async function openWorkspace() {
  window.localStorage.setItem("research_token", "r25i6-token");
  window.localStorage.setItem("notaeo:onboarding:r25i6-user", "done");
  apiMocks.me.mockResolvedValue({ id: "r25i6-user", email: "r25i6@example.test" });
  apiMocks.listNotebooks.mockResolvedValue([{ id: "nb1", name: "Bio", created_at: "2026-01-01T00:00:00Z" }]);
  apiMocks.listSources.mockResolvedValue([]);
  apiMocks.getAISettings.mockResolvedValue({ configured: false });
  apiMocks.getHostedAIStatus.mockRejectedValue(new Error("local app"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Bio" }));
  await screen.findByRole("button", { name: /export notebook/i });
}

function sectionNavs(): string[] {
  return Array.from(document.querySelectorAll('nav[aria-label="Workspace tools"], nav[aria-label="Notebook sections"]')).map(
    (nav) => nav.getAttribute("aria-label") ?? "",
  );
}

it("mobile viewport mounts only the bottom bar", async () => {
  mockViewport(500);
  await openWorkspace();
  expect(sectionNavs()).toEqual(["Notebook sections"]);
});

it("xl viewport mounts only the desktop rail", async () => {
  mockViewport(1400);
  await openWorkspace();
  expect(sectionNavs()).toEqual(["Workspace tools"]);
});

it("lg (non-xl) viewport mounts neither section nav — tabs carry navigation", async () => {
  mockViewport(1100);
  await openWorkspace();
  expect(sectionNavs()).toEqual([]);
  expect(screen.getByRole("tablist", { name: "Workspace sections" })).toBeTruthy();
});
