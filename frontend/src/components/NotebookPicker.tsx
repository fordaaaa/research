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
  { title: "Collect", text: "Drop in PDFs, docs, pasted notes, or public web pages. Read everything in-app. Your sources stay private to your signed-in account." },
  { title: "Research", text: "Plan searches, run deep-research outlines, and write cited overviews — no AI key needed, no paywall for local use." },
  { title: "Study", text: "Flashcards with practice mode, one-page guides, mind maps, Anki export, and Obsidian export. Free for local use." },
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
            A free study app for school: collect sources, research any topic, and study with flashcards, guides, and mind maps. Needs a free account — no AI key needed for core workflows, no paywall for local use.
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
              className={`${inputCls} min-h-11`}
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
              className="min-h-11 rounded-lg px-2 text-xs font-medium text-aqua underline underline-offset-2 hover:text-wave disabled:opacity-50"
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
                  <div
                    className="group flex min-h-24 items-stretch gap-2 rounded-2xl border border-wave/30 bg-gradient-to-br from-neutral-900 via-neutral-900 to-seafoam/60 p-2 shadow-[0_12px_30px_rgba(6,48,62,0.08)] transition-all hover:-translate-y-0.5 hover:border-aqua/50 hover:shadow-[0_16px_36px_rgba(6,48,62,0.14)] animate-card-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <button
                      type="button"
                      aria-label={`Open ${nb.name}`}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-seafoam/50"
                      onClick={() => onOpen(nb)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wave text-sm font-semibold text-mark shadow-sm">
                        {nb.name.trim().charAt(0).toUpperCase() || "N"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-semibold text-neutral-100">{nb.name}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          Created {new Date(nb.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-aqua group-hover:text-wave">Open →</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${nb.name}`}
                      className="min-h-11 min-w-11 self-center rounded-xl px-2 text-xs font-semibold text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-400 focus-visible:text-red-400"
                      onClick={() => onDelete(nb.id)}
                    >
                      Delete
                    </button>
                  </div>
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
