import { useState } from "react";
import * as api from "../api";
import type { Notebook } from "../api";
import { Button, Card, EmptyState } from "./ui";
import { inputCls } from "./ui";

interface Props {
  notebooks: Notebook[];
  onOpen: (nb: Notebook) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const WORKFLOWS = [
  { title: "Collect", text: "Drop in PDFs, docs, pasted notes, or public web pages. Read everything in-app. It all stays on your machine." },
  { title: "Research", text: "Plan searches, run deep-research outlines, and write cited overviews — no key, no account, no paywall." },
  { title: "Study", text: "Flashcards with practice mode, one-page guides, mind maps, Anki export, and Obsidian export. Free forever." },
];

export default function NotebookPicker({ notebooks, onOpen, onCreate, onDelete }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex-1 overflow-y-auto animate-page-in">
      <div className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-8">
        <section className="pt-6 text-center sm:pt-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">research, locally</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">
            A free study app that lives on your machine: collect sources, research any topic, and study with flashcards, guides, and mind maps. No account, no API key, nothing leaves your laptop.
          </p>
        </section>

        <Card className="p-5">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || busy) return;
              setBusy(true);
              setError(null);
              try {
                await onCreate(name.trim());
                setName("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "could not create notebook");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className={inputCls}
              placeholder="New notebook name… e.g. Biology 101"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
              Create
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
            <p className="text-xs text-neutral-500">New here?</p>
            <button
              type="button"
              className="text-xs font-medium text-neutral-200 underline hover:text-white disabled:opacity-50"
              disabled={demoBusy}
              onClick={async () => {
                setDemoBusy(true);
                setError(null);
                try {
                  const nb = await api.createDemo();
                  onOpen(nb);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "could not create demo");
                } finally {
                  setDemoBusy(false);
                }
              }}
            >
              {demoBusy ? "Building demo…" : "Open a demo notebook →"}
            </button>
          </div>
        </Card>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Notebooks
          </h2>
          {notebooks.length === 0 ? (
            <EmptyState title="No notebooks yet — create one above." hint="Each notebook holds its own sources, research, and exports." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {notebooks.map((nb, i) => (
                <li key={nb.id}>
                  <button
                    className="group flex w-full items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-900/80 animate-card-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    onClick={() => onOpen(nb)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{nb.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {new Date(nb.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500 group-hover:text-white">Open →</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${nb.name}`}
                      className="shrink-0 text-xs text-neutral-600 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(nb.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onDelete(nb.id);
                        }
                      }}
                    >
                      delete
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-2 pb-8 sm:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <div key={w.title} className="rounded-2xl border border-neutral-800/80 p-4">
              <p className="text-sm font-semibold">{w.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{w.text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
