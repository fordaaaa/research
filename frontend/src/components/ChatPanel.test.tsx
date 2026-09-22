// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as api from "../api";
import type { ChatMessage, ChatSession } from "../api";
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
  };
});

afterEach(() => cleanup());

const session: ChatSession = {
  id: "session-1", notebook_id: "notebook-1", title: "Cell biology", created_at: "2026-01-01", updated_at: "2026-01-01",
};
const assistant: ChatMessage = {
  id: "message-1", session_id: "session-1", role: "assistant", text: "Mitochondria make ATP.",
  citations: [{ source_id: "source-1", source_title: "Cell notes", pages: [2] }], model: "test-model", created_at: "2026-01-01",
};

function renderPanel(configured = true) {
  const onConfigure = vi.fn();
  const onOpenSource = vi.fn();
  render(<ChatPanel notebookId="notebook-1" configured={configured} onConfigure={onConfigure} onOpenSource={onOpenSource} />);
  return { onConfigure, onOpenSource };
}

describe("ChatPanel sessions", () => {
  beforeEach(() => {
    vi.mocked(api.listChatSessions).mockResolvedValue([session]);
    vi.mocked(api.listChatMessages).mockResolvedValue([assistant]);
  });

  it("loads persisted history and opens clickable citations", async () => {
    const { onOpenSource } = renderPanel();
    await waitFor(() => expect(screen.getByText("Mitochondria make ATP.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Cell notes/i }));
    expect(onOpenSource).toHaveBeenCalledWith("source-1");
  });

  it("keeps history readable but disables composer without an AI key", async () => {
    const { onConfigure } = renderPanel(false);
    await waitFor(() => expect(screen.getByText("Mitochondria make ATP.")).toBeTruthy());
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: /set up ai/i }));
    expect(onConfigure).toHaveBeenCalled();
  });

  it("creates a session and sends a message", async () => {
    const created = { ...session, id: "session-2", title: "New conversation" };
    vi.mocked(api.createChatSession).mockResolvedValue(created);
    vi.mocked(api.sendChatMessage).mockResolvedValue({ ...assistant, id: "message-2", session_id: "session-2" });
    vi.mocked(api.listChatMessages).mockResolvedValue([]);
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cell biology" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "New conversation" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "What makes ATP?" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalledWith("notebook-1", "session-2", "What makes ATP?"));
    expect(screen.getByRole("button", { name: "What makes ATP?" })).toBeTruthy();
  });

  it("does not leak a late answer into a newly selected session", async () => {
    const second = { ...session, id: "session-2", title: "Second chat" };
    vi.mocked(api.listChatSessions).mockResolvedValue([session, second]);
    vi.mocked(api.listChatMessages).mockImplementation(async (_notebookId: string, sessionId: string) => {
      if (sessionId === "session-2") return [];
      return [assistant];
    });
    let resolveSend!: (value: ChatMessage) => void;
    const pending = new Promise<ChatMessage>((resolve) => { resolveSend = resolve; });
    vi.mocked(api.sendChatMessage).mockReturnValue(pending);
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cell biology" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Late question" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Second chat" }));
    await waitFor(() => expect(screen.queryByText("Mitochondria make ATP.")).toBeNull());
    resolveSend({ ...assistant, id: "message-late", session_id: "session-1", text: "Late answer." });
    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalled());
    expect(screen.queryByText("Late answer.")).toBeNull();
    expect(screen.queryByText("Late question")).toBeNull();
  });

  it("only disables the composer of the session that is sending", async () => {
    const second = { ...session, id: "session-2", title: "Second chat" };
    vi.mocked(api.listChatSessions).mockResolvedValue([session, second]);
    vi.mocked(api.listChatMessages).mockImplementation(async (_notebookId: string, sessionId: string) => {
      if (sessionId === "session-2") return [];
      return [assistant];
    });
    let resolveSend!: (value: ChatMessage) => void;
    const pending = new Promise<ChatMessage>((resolve) => { resolveSend = resolve; });
    vi.mocked(api.sendChatMessage).mockReturnValue(pending);
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cell biology" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Busy question" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Second chat" }));
    await waitFor(() => expect(screen.queryByText("Mitochondria make ATP.")).toBeNull());
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: /^send$/i })).toBeTruthy();
    resolveSend({ ...assistant, id: "message-done", session_id: "session-1", text: "Done." });
  });

  it("pages long histories behind a show-older button", async () => {
    const many: ChatMessage[] = Array.from({ length: 51 }, (_, i) => ({
      ...assistant,
      id: `message-${i}`,
      text: `History ${i}`,
    }));
    vi.mocked(api.listChatSessions).mockResolvedValue([session]);
    vi.mocked(api.listChatMessages).mockImplementation(
      async (_notebookId: string, _sessionId: string, _limit?: number, before?: string) => {
        if (before) return [{ ...assistant, id: "message-0", text: "History 0" }];
        return many;
      }
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText("History 50")).toBeTruthy());
    expect(screen.queryByText("History 0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show older messages/i }));
    await waitFor(() => expect(screen.getByText("History 0")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /show older messages/i })).toBeNull();
  });
});
