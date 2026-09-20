import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { Note, NoteSummary } from "../api";
import Spinner from "./Spinner";
import { Button, Card, EmptyState, SectionHeader, inputCls } from "./ui";

interface Props {
  notebookId: string;
  autosaveMs?: number;
}

function toSummary(note: Note): NoteSummary {
  const { body: _body, ...summary } = note;
  return summary;
}

export default function NotesPanel({ notebookId, autosaveMs = 900 }: Props) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "conflict">("loading");
  const [error, setError] = useState<string | null>(null);
  const editVersion = useRef(0);
  const openRequest = useRef(0);
  const noteRef = useRef<Note | null>(null);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const openNote = async (id: string) => {
    const request = openRequest.current + 1;
    openRequest.current = request;
    setStatus("loading");
    setError(null);
    try {
      const next = await api.getNote(notebookId, id);
      if (openRequest.current !== request) return;
      setNote(next);
      editVersion.current = 0;
      setDirty(false);
      setStatus("idle");
    } catch (err) {
      if (openRequest.current !== request) return;
      setError(err instanceof Error ? err.message : "could not open note");
      setStatus("idle");
    }
  };

  useEffect(() => {
    let active = true;
    const request = openRequest.current + 1;
    openRequest.current = request;
    setStatus("loading");
    api.listNotes(notebookId)
      .then(async (items) => {
        if (!active || openRequest.current !== request) return;
        setNotes((current) => {
          const known = new Set(items.map((item) => item.id));
          const localOnly = current.filter((item) => !known.has(item.id));
          return [...localOnly, ...items];
        });
        if (!noteRef.current && items[0]) {
          const first = await api.getNote(notebookId, items[0].id);
          if (active && openRequest.current === request && !noteRef.current) setNote(first);
          editVersion.current = 0;
        } else if (!items[0] && !noteRef.current) {
          setNote(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "could not load notes"))
      .finally(() => { if (active && openRequest.current === request) setStatus("idle"); });
    return () => {
      active = false;
    };
  }, [notebookId]);

  useEffect(() => {
    if (!dirty || !note) return;
    const snapshot = note;
    const snapshotVersion = editVersion.current;
    const timer = window.setTimeout(async () => {
      setStatus("saving");
      setError(null);
      try {
        const saved = await api.updateNote(notebookId, snapshot.id, {
          base_rev: snapshot.rev,
          title: snapshot.title,
          body: snapshot.body,
          tags: snapshot.tags,
          citations: snapshot.citations,
        });
        const unchanged = editVersion.current === snapshotVersion;
        setNote((current) => {
          if (!current || current.id !== saved.id) return current;
          if (unchanged) return saved;
          return { ...current, rev: saved.rev, updated_at: saved.updated_at };
        });
        setDirty(!unchanged);
        setStatus(unchanged ? "saved" : "idle");
        setNotes((items) => [toSummary(saved), ...items.filter((item) => item.id !== saved.id)]);
      } catch (err) {
        if (err instanceof api.NoteConflictError) {
          const localTitle = snapshot.title;
          const localBody = snapshot.body;
          setNote({ ...err.current, title: localTitle, body: localBody });
          setNotes((items) => [toSummary(err.current), ...items.filter((item) => item.id !== err.current.id)]);
          setDirty(true);
          setStatus("conflict");
          setError("This note changed in another editor. Your latest text is kept above; review it, then wait for autosave to retry with the newest revision.");
        } else {
          setError(err instanceof Error ? err.message : "could not save note");
          setStatus("idle");
        }
      }
    }, autosaveMs);
    return () => window.clearTimeout(timer);
  }, [autosaveMs, dirty, note, notebookId]);

  const create = async () => {
    setError(null);
    try {
      const created = await api.createNote(notebookId, { title: "Untitled note", body: "" });
      setNotes((items) => [toSummary(created), ...items]);
      setNote(created);
      editVersion.current = 0;
      setDirty(false);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not create note");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteNote(notebookId, id);
      const remaining = notes.filter((item) => item.id !== id);
      setNotes(remaining);
      if (note?.id === id) {
        setNote(null);
        if (remaining[0]) await openNote(remaining[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not delete note");
    }
  };

  return (
    <Card className="min-h-[28rem] overflow-hidden animate-pop-in">
      <div className="border-b border-neutral-800 p-4 sm:p-5">
        <SectionHeader
          title="Notebook notes"
          sub="Markdown notes live with this notebook and work without AI."
          right={<Button onClick={create}>New note</Button>}
        />
      </div>
      <div className="grid min-h-[24rem] md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b border-neutral-800 p-2 md:border-b-0 md:border-r">
          {notes.length === 0 ? (
            <EmptyState title="No notes yet" hint="Create one for ideas, summaries, and citations." />
          ) : (
            <ul className="space-y-1">
              {notes.map((item) => (
                <li key={item.id} className="flex items-center gap-1 rounded-xl hover:bg-neutral-800">
                  <button
                    type="button"
                    className={`min-h-11 min-w-0 flex-1 truncate rounded-xl px-3 text-left text-sm ${note?.id === item.id ? "bg-neutral-800 font-semibold" : ""}`}
                    onClick={() => openNote(item.id)}
                  >
                    {item.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.title}`}
                    className="min-h-11 rounded-lg px-3 text-xs text-neutral-500 hover:text-red-400"
                    onClick={() => remove(item.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="min-w-0 p-4 sm:p-5">
          {status === "loading" && !note ? (
            <p className="flex items-center gap-2 text-sm text-neutral-500"><Spinner /> Loading notes…</p>
          ) : note ? (
            <div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`note-title-${note.id}`}>Note title</label>
                <input
                  id={`note-title-${note.id}`}
                  aria-label="Note title"
                  className={`${inputCls} font-semibold`}
                  value={note.title}
                  onChange={(event) => {
                    setNote({ ...note, title: event.target.value });
                    editVersion.current += 1;
                    setDirty(true);
                  }}
                />
                <span className="shrink-0 text-xs text-neutral-500" aria-live="polite">
                  {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "conflict" ? "Reloaded newer version" : ""}
                </span>
              </div>
              <label className="sr-only" htmlFor={`note-body-${note.id}`}>Note body</label>
              <textarea
                id={`note-body-${note.id}`}
                aria-label="Note body"
                className={`${inputCls} mt-3 min-h-[18rem] resize-y font-mono leading-relaxed`}
                placeholder="Write in Markdown…"
                value={note.body}
                onChange={(event) => {
                  setNote({ ...note, body: event.target.value });
                  editVersion.current += 1;
                  setDirty(true);
                }}
              />
              <p className="mt-2 text-xs text-neutral-500">Markdown · autosaved with revision protection · AI not required</p>
            </div>
          ) : (
            <EmptyState title="Choose a note or create a new one" />
          )}
          {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
        </section>
      </div>
    </Card>
  );
}
