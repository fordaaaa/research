// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const chatApiMocks = vi.hoisted(() => ({
  listChatSessions: vi.fn(),
  listChatMessages: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    ...chatApiMocks,
    createChatSession: vi.fn(),
    deleteChatSession: vi.fn(),
    sendChatMessage: vi.fn(),
    sendHostedChatMessage: vi.fn(),
  };
});

import ChatPanel from "./ChatPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("empty chat uses EmptyState with Set up AI CTA", async () => {
  chatApiMocks.listChatSessions.mockResolvedValue([
    { id: "s1", notebook_id: "nb", title: "New conversation", created_at: "2026-01-01", updated_at: "2026-01-01" },
  ]);
  chatApiMocks.listChatMessages.mockResolvedValue([]);
  const onConfigure = vi.fn();
  render(<ChatPanel notebookId="nb" configured={false} onConfigure={onConfigure} onOpenSource={vi.fn()} />);
  await screen.findByText("No messages yet.");
  const cta = screen.getByRole("button", { name: /set up ai/i });
  expect(cta).toBeTruthy();
  // exactly one setup CTA (header CTA hides while the empty state shows its own)
  expect(screen.getAllByRole("button", { name: /set up ai/i }).length).toBe(1);
  fireEvent.click(cta);
  expect(onConfigure).toHaveBeenCalled();
});
