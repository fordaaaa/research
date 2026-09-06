import { useState } from "react";
import type { ChatResponse } from "../api";

interface Props {
  configured: boolean;
  onAsk: (message: string) => Promise<ChatResponse>;
  onConfigure: () => void;
}

export default function ChatPanel({ configured, onAsk, onConfigure }: Props) {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="max-w-2xl mx-auto mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 animate-pop-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Ask your sources</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Answers are grounded in your notebook’s imported sources.</p>
        </div>
        {!configured && <button className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800" onClick={onConfigure}>Set up AI</button>}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!message.trim() || busy) return;
          setBusy(true);
          setError(null);
          try {
            setAnswer(await onAsk(message.trim()));
          } catch (err) {
            setError(err instanceof Error ? err.message : "AI could not answer");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          placeholder={configured ? "Ask about this notebook…" : "Set up AI to ask your sources…"}
          value={message}
          disabled={!configured}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50" disabled={!configured || busy || !message.trim()} type="submit">
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {answer && (
        <div className="mt-4 border-t border-neutral-800 pt-4 animate-card-in">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{answer.answer}</p>
          {answer.citations.length > 0 && (
            <p className="mt-3 text-xs text-neutral-500">Sources: {answer.citations.map((citation, index) => `[${index + 1}] ${citation.source_title}`).join(" · ")}</p>
          )}
          {answer.model && <p className="mt-2 text-xs text-neutral-500">Answered by {answer.model}</p>}
        </div>
      )}
    </section>
  );
}
