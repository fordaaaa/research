// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import * as api from "../api";
import ChatPanel from "./ChatPanel";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    listChatSessions: vi.fn(),
    createChatSession: vi.fn(),
    deleteChatSession: vi.fn(),
    listChatMessages: vi.fn(),
    sendChatMessage: vi.fn(),
    sendHostedChatMessage: vi.fn(),
  };
});

afterEach(() => cleanup());

it("uses a single live region per loading block (no nested role=status inside aria-live)", async () => {
  vi.mocked(api.listChatSessions).mockResolvedValue([
    { id: "session-1", notebook_id: "nb-1", title: "Chat", created_at: "2026-01-01", updated_at: "2026-01-01" },
  ]);
  // Never-resolving history keeps the loading block mounted for assertion.
  vi.mocked(api.listChatMessages).mockReturnValue(new Promise(() => {}));
  render(<ChatPanel notebookId="nb-1" configured onConfigure={vi.fn()} onOpenSource={vi.fn()} />);
  await waitFor(() => expect(screen.getByText(/loading history/i)).toBeTruthy());
  const history = screen.getByText(/loading history/i).closest("[aria-live]")!;
  expect(history).toBeTruthy();
  // Exactly one live region owns this loading block: the outer polite
  // container. No nested role=status may live inside it.
  const nested = within(history as HTMLElement).queryAllByRole("status");
  expect(nested.length).toBe(0);
});
