import { useState } from "react";
import * as api from "../api";
import type { Notebook } from "../api";
import { Button, Card, EmptyState } from "./ui";
import { inputCls } from "./ui";

interface Props {
  notebooks: Notebook[];
  tourPending?: boolean;
  onOpen: (nb: Notebook) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const WORKFLOWS = [
  { title: "Collect", text: "Drop in PDFs, docs, pasted notes, or public web pages. Read everything in-app. Your sources stay private to your signed-in account." },
  { title: "Research", text: "Plan searches, run deep-research outlines, and write cited overviews — no AI key needed, no paywall for local use." },
  { title: "Study", text: "Flashcards with practice mode, one-page guides, mind maps, Anki export, and Obsidian export. Free for local use." },
];

export default function NotebookPicker({ notebooks, tourPending = false, onOpen, onCreate, onDelete }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const visibleNotebooks = notebooks.filter((notebook) => notebook.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <main className="flex-1 overflow-y-auto animate-page-in">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-10 sm:py-12">
        <section className="relative overflow-hidden rounded-[2rem] bg-brand-deep px-7 py-9 text-mark shadow-[0_25px_70px_rgba(6,48,62,0.14)] sm:px-12 sm:py-12">
          <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border border-mark/15" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-8 -top-16 h-80 w-80 rounded-full border border-mark/20" aria-hidden="true" />
          <div className="pointer-events-none absolute right-8 top-8 h-52 w-52 rounded-full bg-aqua/30 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aquabright">Your research space</p>
            <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">A place for every idea.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-mark/80">Collect sources, make sense of what you find, and turn it into work you can keep. A free account is required; core workflows need no AI key and have no paywall for local use.</p>
          </div>
        </section>

        {tourPending && <p className="rounded-xl border border-aqua/30 bg-seafoam p-3 text-sm text-neutral-300">Your tour continues inside a notebook. Create one or open the demo to see the rest.</p>}
        <div data-tour="create-notebook"><Card className="p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold">Start something new</h2>
            <span className="text-xs text-neutral-500">One notebook per class, project, or question</span>
          </div>
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
              data-tour="demo-notebook"
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
        </Card></div>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua">Your library</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Notebooks <span className="font-sans text-base font-medium text-neutral-500">{notebooks.length}</span></h2>
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search notebooks</span>
              <input type="search" aria-label="Search notebooks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notebooks" className={`${inputCls} w-full pl-10`} />
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth="1.7" /><path d="m16 16 5 5" strokeWidth="1.7" /></svg>
            </label>
          </div>
          {notebooks.length === 0 ? (
            <EmptyState title="No notebooks yet — create one above." hint="Each notebook holds its own sources, research, and exports." />
          ) : visibleNotebooks.length === 0 ? (
            <EmptyState title="No matching notebooks" hint="Try another search or create a new notebook." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNotebooks.map((nb, i) => (
                <li key={nb.id}>
                  <div
                    className="group flex min-h-36 flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-[0_6px_25px_rgba(6,48,62,0.04)] transition-all hover:-translate-y-0.5 hover:border-aqua/50 hover:shadow-[0_16px_36px_rgba(6,48,62,0.1)] animate-card-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <button
                      type="button"
                      aria-label={`Open ${nb.name}`}
                      className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl text-left"
                      onClick={() => onOpen(nb)}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-seafoam font-display text-xl font-semibold text-wave">
                        {nb.name.trim().charAt(0).toUpperCase() || "N"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-lg font-semibold text-neutral-100">{nb.name}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          Created {new Date(nb.created_at).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                      <span className="text-xs font-semibold text-aqua">Open notebook ↗</span>
                      <button
                      type="button"
                      aria-label={`Delete ${nb.name}`}
                      className="min-h-11 min-w-11 rounded-lg px-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-400 focus-visible:text-red-400"
                      onClick={() => onDelete(nb.id)}
                    >
                      Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3 border-t border-neutral-800 pt-7 pb-8 sm:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <div key={w.title} className="border-l-2 border-aqua/40 pl-4">
              <p className="font-display text-lg font-semibold">{w.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{w.text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
