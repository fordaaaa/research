// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

it("announces loading sessions/history via role=status", () => {
  vi.mocked(api.listChatSessions).mockReturnValue(new Promise(() => {}));
  vi.mocked(api.listChatMessages).mockReturnValue(new Promise(() => {}));
  render(<ChatPanel notebookId="nb-1" configured onConfigure={vi.fn()} onOpenSource={vi.fn()} />);
  const statuses = screen.getAllByRole("status");
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses[0].textContent ?? "").toMatch(/loading chats/i);
});
