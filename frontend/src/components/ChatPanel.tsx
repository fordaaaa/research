import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import * as api from "../api";
import type { ChatMessage, ChatSession } from "../api";
import Spinner from "./Spinner";
import ThinkingDots from "./ThinkingDots";

interface Props {
  notebookId: string;
  configured: boolean;
  onConfigure: () => void;
  onOpenSource: (sourceId: string) => void;
}

export default function ChatPanel({ notebookId, configured, onConfigure, onOpenSource }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    setLoadingSessions(true);
    setError(null);
    setSelectedId(null);
    setMessages([]);
    api.listChatSessions(notebookId)
      .then((next) => { if (active) { setSessions(next); setSelectedId(next[0]?.id ?? null); } })
      .catch((err) => active && setError(err instanceof Error ? err.message : "could not load chat sessions"))
      .finally(() => active && setLoadingSessions(false));
    return () => { active = false; };
  }, [notebookId]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let active = true;
    setLoadingMessages(true);
    api.listChatMessages(notebookId, selectedId)
      .then((next) => active && setMessages(next))
      .catch((err) => active && setError(err instanceof Error ? err.message : "could not load chat history"))
      .finally(() => active && setLoadingMessages(false));
    return () => { active = false; };
  }, [notebookId, selectedId]);

  async function newSession() {
    setError(null);
    try {
      const created = await api.createChatSession(notebookId);
      setSessions((current) => [created, ...current]);
      setSelectedId(created.id);
      setMessages([]);
    } catch (err) { setError(err instanceof Error ? err.message : "could not create chat session"); }
  }

  async function deleteSession(id: string) {
    setError(null);
    try {
      await api.deleteChatSession(notebookId, id);
      const remaining = sessions.filter((session) => session.id !== id);
      setSessions(remaining);
      if (selectedId === id) {
        setSelectedId(remaining[0]?.id ?? null);
        if (remaining.length === 0) setMessages([]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "could not delete chat session"); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !selectedId || busy || !configured) return;
    setBusy(true); setError(null);
    const sessionId = selectedId;
    const userMessage: ChatMessage = { id: `pending-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`, session_id: sessionId, role: "user", text: trimmed, citations: [], model: null, created_at: new Date().toISOString() };
    setMessages((current) => [...current, userMessage]); setMessage("");
    try {
      const answer = await api.sendChatMessage(notebookId, sessionId, trimmed);
      setSessions((current) => current.map((session) => session.id === sessionId ? {
        ...session,
        title: session.title === "New conversation" ? trimmed.slice(0, 80) : session.title,
        updated_at: answer.created_at,
      } : session));
      if (selectedIdRef.current !== sessionId) return;
      setMessages((current) => current.some((item) => item.id === userMessage.id) ? [...current, answer] : current);
    } catch (err) {
      if (selectedIdRef.current !== sessionId) return;
      setMessages((current) => current.filter((item) => item.id !== userMessage.id));
      setError(err instanceof Error ? err.message : "could not send message");
    } finally {
      setBusy(false);
    }
  }

  const selected = sessions.find((session) => session.id === selectedId);
  return (
    <section className="mx-auto mb-8 w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Ask your sources</h2><p className="mt-0.5 text-xs text-neutral-500">AI is an optional enhancer; your imported sources and chat history remain available without it.</p></div>
        <div className="flex items-center gap-2">
          {!configured && <button type="button" className="min-h-11 rounded-lg border border-neutral-700 px-3 text-xs text-neutral-300 hover:bg-neutral-800" onClick={onConfigure}>Set up AI</button>}
          <button type="button" className="min-h-11 rounded-lg bg-neutral-100 px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-200" onClick={() => void newSession()}>New chat</button>
        </div>
      </div>
      {loadingSessions ? <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500"><Spinner /> Loading chats…</div> : (
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(10rem,14rem)_1fr]">
          <aside className="space-y-1" aria-label="Chat sessions">
            {sessions.length === 0 && <p className="px-2 text-xs text-neutral-500">No chats yet. Start a new one.</p>}
            {sessions.map((session) => <div key={session.id} className="flex items-center gap-1"><button type="button" className={`min-h-11 min-w-0 flex-1 truncate rounded-lg px-3 text-left text-sm ${session.id === selectedId ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"}`} aria-pressed={session.id === selectedId} onClick={() => setSelectedId(session.id)}>{session.title}</button><button type="button" aria-label={`Delete ${session.title}`} className="min-h-11 min-w-11 rounded-lg px-2 text-xs text-neutral-500 hover:bg-red-950 hover:text-red-300" onClick={() => void deleteSession(session.id)}>×</button></div>)}
          </aside>
          <div className="min-w-0">
            {selected && <p className="mb-2 text-xs font-medium text-neutral-500">{selected.title}</p>}
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-neutral-800 p-3" aria-live="polite">
              {loadingMessages && <div className="flex items-center gap-2 text-sm text-neutral-500"><Spinner /> Loading history…</div>}
              {!loadingMessages && messages.length === 0 && <p className="text-sm text-neutral-500">No messages yet. Ask a question when AI is configured.</p>}
              {messages.map((item) => <article key={item.id} className={`rounded-xl p-3 text-sm ${item.role === "user" ? "ml-6 bg-neutral-800" : "mr-6 bg-neutral-950"}`}><p className="whitespace-pre-wrap leading-relaxed text-neutral-200">{item.text}</p>{item.citations.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">{item.citations.map((citation, index) => <button key={`${item.id}-${citation.source_id}-${index}`} type="button" className="min-h-11 rounded-lg border border-neutral-700 px-2 hover:bg-neutral-800" onClick={() => onOpenSource(citation.source_id)}>[{index + 1}] {citation.source_title}</button>)}</div>}{item.model && <p className="mt-2 text-[11px] text-neutral-600">Answered by {item.model}</p>}</article>)}
              {busy && <div className="mr-6 flex items-center gap-2 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-500"><ThinkingDots state="composing" /> Thinking…</div>}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={sendMessage}><input className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-base outline-none focus:border-neutral-500 sm:text-sm" placeholder={configured ? "Ask about this notebook…" : "Set up AI to ask your sources…"} value={message} disabled={!configured || !selectedId || busy} onChange={(event) => setMessage(event.target.value)} /><button className="min-h-11 rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50" disabled={!configured || !selectedId || busy || !message.trim()} type="submit">{busy ? "Sending…" : "Send"}</button></form>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}
