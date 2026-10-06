// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ChatMessage, ChatSession } from "../api";

const mocks = vi.hoisted(() => ({ listChatSessions: vi.fn(), listChatMessages: vi.fn(), createChatSession: vi.fn(), deleteChatSession: vi.fn(), sendChatMessage: vi.fn() }));
vi.mock("../api", async () => ({ ...await vi.importActual<typeof import("../api")>("../api"), ...mocks }));
vi.mock("thinking-orbs", () => ({ ThinkingOrb: (props: { "aria-label": string }) => <div role="img" aria-label={props["aria-label"]} /> }));
import ChatPanel from "./ChatPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { configured: true, onConfigure: vi.fn(), onOpenSource: vi.fn() };
const session: ChatSession = { id: "one", notebook_id: "nb", title: "First chat", created_at: "2026-01-01", updated_at: "2026-01-01" };
const message: ChatMessage = { id: "m", session_id: "one", role: "user", text: "Hi", citations: [], model: null, created_at: "2026-01-01" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("recovers older-message loading after switching away from a pending request", async () => {
  const pending = deferred<ChatMessage[]>();
  const second = { ...session, id: "two", title: "Second chat" };
  const history = Array.from({ length: 51 }, (_, index) => ({ ...message, id: `m-${index}` }));
  mocks.listChatSessions.mockResolvedValue([session, second]);
  mocks.listChatMessages.mockImplementation((_nb: string, _id: string, _limit: number, before?: string) => before ? pending.promise : Promise.resolve(history));
  render(<ChatPanel notebookId="nb" {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show older messages" }));
  fireEvent.click(screen.getByRole("button", { name: "Second chat" }));
  const older = await screen.findByRole("button", { name: "Show older messages" });
  expect(older).toHaveProperty("disabled", false);
  await act(async () => pending.resolve([{ ...message, text: "Stale older message" }]));
  expect(screen.queryByText("Stale older message")).toBeNull();
});

it("ignores a late created session after changing notebooks", async () => {
  const pending = deferred<ChatSession>();
  mocks.listChatSessions.mockResolvedValue([session]);
  mocks.listChatMessages.mockResolvedValue([]);
  mocks.createChatSession.mockReturnValue(pending.promise);
  const view = render(<ChatPanel notebookId="nb" {...props} />);
  await screen.findByText("No messages yet.");
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  view.rerender(<ChatPanel notebookId="other" {...props} />);
  await screen.findByText("No messages yet.");
  await act(async () => pending.resolve({ ...session, id: "late", title: "Old notebook chat" }));
  expect(screen.queryByRole("button", { name: "Old notebook chat" })).toBeNull();
});

it("shows the shared thinking state until a real response settles", async () => {
  const pending = deferred<ChatMessage>();
  mocks.listChatSessions.mockResolvedValue([session]);
  mocks.listChatMessages.mockResolvedValue([]);
  mocks.sendChatMessage.mockReturnValue(pending.promise);
  render(<ChatPanel notebookId="nb" {...props} />);
  await screen.findByText("No messages yet.");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("img", { name: "AI is thinking…" })).toBeTruthy();
  await act(async () => pending.resolve({ ...message, id: "answer", role: "assistant", text: "Answer" }));
  expect(screen.getByText("Answer")).toBeTruthy();
  expect(screen.queryByRole("img", { name: "AI is thinking…" })).toBeNull();
});
