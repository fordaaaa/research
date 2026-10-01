import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { Notebook } from "../api";
import { Button, Card, EmptyState } from "./ui";
import { inputCls } from "./ui";
import Checklist from "./Checklist";
import type { ChecklistAction } from "./Checklist";

interface Props {
  /** "library" embeds the picker inside the dashboard: no hero, no footer, no main landmark. */
  variant?: "full" | "library";
  notebooks: Notebook[];
  tourPending?: boolean;
  /**
   * True while any tour stage is active. The filter repair below must not
   * steal a just-restored focus: the tour teardown restores to #main-content
   * (or its captured trigger), and a repair firing in the same flush would
   * yank focus to the search field and win the race.
   */
  tourActive?: boolean;
  userId?: string;
  sourcesCount?: number;
  hasSearched?: boolean;
  hasExportedOrReviewed?: boolean;
  onOpen: (nb: Notebook) => void;
  onCreate: (name: string) => Promise<Notebook | void>;
  onDelete: (id: string) => Promise<void>;
}

const WORKFLOWS = [
  { title: "Collect", text: "Drop in PDFs, docs, pasted notes, or public web pages. Read everything in-app. Your sources stay private to your signed-in account." },
  { title: "Research", text: "Plan searches, run deep-research outlines, and write cited overviews — no AI key needed, no paywall for local use." },
  { title: "Study", text: "Flashcards with practice mode, one-page guides, mind maps, Anki export, and Obsidian export. Free for local use." },
];

export default function NotebookPicker({ variant = "full", notebooks, tourPending = false, tourActive = false, userId, sourcesCount = 0, hasSearched = false, hasExportedOrReviewed = false, onOpen, onCreate, onDelete }: Props) {
  const isLibrary = variant === "library";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  // Round 24 item 5: Escape disarms AND pins focus to the arm (Delete)
  // button (mirror SourceList). Same-node label flip keeps a focused
  // confirm for free; an Escape from anywhere else lands on the armed row's
  // Delete. No armed confirm → no focus steal.
  function pinFocusToDeleteArm() {
    const scope = listRef.current ?? document;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.getAttribute("aria-label")?.startsWith("Confirm delete")) {
      active.focus();
      return;
    }
    scope.querySelector<HTMLButtonElement>('button[aria-label^="Confirm delete"]')?.focus();
  }

  function disarmDeleteConfirm() {
    pinFocusToDeleteArm();
    setConfirmDeleteId(null);
  }

  // Round 21 item 3 + Round 25 item 1 (escape audit): the armed delete
  // confirm disarms via a window capture-phase Escape from ANY focus
  // (mirror the tour pattern) — the button-level onKeyDown below only fires
  // when the confirm button itself is focused. Blur still never disarms.
  //
  // Round 25 audit finding: this listener used to mount ONLY while armed
  // (`if (confirmDeleteId === null) return`). Registration then waited for
  // the passive effect after the arming click's commit, so a fast/live
  // Escape in that gap hit no listener and the armed Confirm survived.
  // Like SourceList, the listener is now unconditional (registered once at
  // mount, never cleaned up early): the handler itself is the guard, and
  // both halves are no-ops when nothing is armed (pinFocus finds no
  // Confirm in the DOM; setConfirmDeleteId(null) is a state no-op), so
  // there is no stale-closure or focus-steal risk.
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") disarmDeleteConfirm();
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
    // disarm/pin only touch refs + stable setState: safe to register once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round 21 item 3: a refreshed list retires any armed delete confirmation
  // (mirror SourceList) so a "Confirm?" armed for a stale row can never fire
  // after the rows changed.
  const notebooksRef = useRef(notebooks);
  useEffect(() => {
    if (notebooksRef.current !== notebooks) {
      notebooksRef.current = notebooks;
      setConfirmDeleteId(null);
    }
  }, [notebooks]);  const searchRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const demoRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  // A just-created notebook awaiting focus once the parent list
  // includes its row. Kept until the row exists so focus never drops to
  // <body> when the refresh lands a beat later.
  const pendingFocusRef = useRef<{ id: string; name: string } | null>(null);
  const visibleNotebooks = notebooks.filter((notebook) => notebook.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  // Checklist rows deep-link to the matching control on this landing page.
  // (Rows never check themselves off — completion still derives from real props.)
  function handleChecklistAction(action: ChecklistAction) {
    if (action === "search") {
      searchRef.current?.focus();
      return;
    }
    if (action === "review") {
      demoRef.current?.focus();
      return;
    }
    if (action === "source") {
      // Round 22 item 4: this row used to focus #new-notebook-name like the
      // "notebook" row — a dead end for adding a source. Prefer the
      // workspace add-source entry (paste title when the editor is open,
      // else the add-sources card's first control); on landing, where no
      // editor exists, focus the path into a notebook instead.
      const pasteTitle = document.getElementById("paste-title");
      if (pasteTitle instanceof HTMLElement) {
        pasteTitle.focus();
        return;
      }
      const addCard = document.querySelector('[data-tour="add-sources"]');
      const entry = addCard?.querySelector<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea, [tabindex]",
      );
      if (entry instanceof HTMLElement) {
        entry.focus();
        return;
      }
      if (addCard instanceof HTMLElement) {
        addCard.focus();
        return;
      }
      const firstOpen = listRef.current?.querySelector<HTMLButtonElement>('button[aria-label^="Open "]');
      if (firstOpen) {
        firstOpen.focus();
        return;
      }
      if (demoRef.current) {
        demoRef.current.focus();
        return;
      }
    }
    nameRef.current?.focus();
  }

  useEffect(() => {
    // Filtering re-renders the results list; if the focused notebook button
    // was filtered out, focus would drop to <body> and the next Tab would
    // leave the workspace. Repair by returning focus to the search field —
    // unless a tour is active: the tour owns focus while mounted and its
    // teardown restores to #main-content, which this repair must not steal.
    if (tourActive) return;
    if (document.activeElement === document.body) searchRef.current?.focus();
  }, [query, visibleNotebooks.length, tourActive]);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const open = listRef.current
      ? Array.from(listRef.current.querySelectorAll("button")).find(
          (button) => button.getAttribute("aria-label") === `Open ${target.name}`,
        )
      : undefined;
    // The row is not rendered yet (refresh still in flight, or filtered
    // out): stay pending and retry on the next list update.
    if (!(open instanceof HTMLElement)) return;
    pendingFocusRef.current = null;
    // Re-assert at focus time so the region text is present when AT lands.
    setAnnouncement(`Notebook ${target.name} created`);
    const focusRow = () => {
      if (typeof open.scrollIntoView === "function") open.scrollIntoView({ block: "nearest" });
      open.focus();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusRow);
    } else {
      focusRow();
    }
  }, [notebooks]);

  const Tag = (isLibrary ? "section" : "main") as "section" | "main";
  return (
    <Tag
      id={isLibrary ? undefined : "main-content"}
      tabIndex={-1}
      aria-label={isLibrary ? "Notebook library" : undefined}
      className="flex-1 overflow-y-auto outline-none animate-page-in"
    >
      <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-10 sm:py-12">
        {!isLibrary && (<section aria-label="Your study library" className="relative overflow-hidden rounded-[2rem] bg-brand-deep px-5 py-7 text-mark shadow-[0_25px_70px_rgba(6,48,62,0.14)] sm:px-12 sm:py-12">
          <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border border-mark/15" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-8 -top-16 h-80 w-80 rounded-full border border-mark/20" aria-hidden="true" />
          <div className="pointer-events-none absolute right-8 top-8 h-52 w-52 rounded-full bg-aqua/30 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aquabright">Your study library</p>
            <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Your books, notes, and questions.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-mark/80">Make a notebook for each class or assignment. Collect sources, search them, take notes, and build study material. A free account is required; core tools need no AI key and have no paywall for local use.</p>
          </div>
        </section>)}

        {tourPending && <p className="rounded-xl border border-aqua/30 bg-seafoam p-3 text-sm text-neutral-300">Your tour continues inside a notebook. Create one or open the demo to see the rest.</p>}
        {announcement && (
          <p role="status" className="sr-only">
            {announcement}
          </p>
        )}
        {userId && (
          <section aria-label="Getting started checklist">
            <Checklist
              userId={userId}
              hasNotebook={notebooks.length > 0}
              hasSource={sourcesCount > 0}
              hasSearched={hasSearched}
              hasExportedOrReviewed={hasExportedOrReviewed}
              onAction={handleChecklistAction}
            />
          </section>
        )}
        <nav aria-label="Notebook actions" data-tour="create-notebook"><Card className="p-5 sm:p-7">
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
                const created = await onCreate(name.trim());
                const createdName =
                  created && typeof created === "object" ? created.name : name.trim();
                const createdId =
                  created && typeof created === "object" && typeof created.id === "string"
                    ? created.id
                    : "";
                pendingFocusRef.current = { id: createdId, name: createdName };
                setAnnouncement(`Notebook ${createdName} created`);
                setName("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "could not create notebook");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="sr-only" htmlFor="new-notebook-name">Notebook name</label>
            <input
              id="new-notebook-name"
              ref={nameRef}
              className={`${inputCls} min-h-11`}
              placeholder="New notebook name… e.g. Biology 101"
              value={name}
              maxLength={120}
              aria-describedby={name.trim() ? undefined : "new-notebook-helper"}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
              Create
            </Button>
          </form>
          {!name.trim() && (
            <p id="new-notebook-helper" className="mt-2 text-xs text-neutral-500">
              Name your notebook to continue
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
            <p className="text-xs text-neutral-500">New here?</p>
            <button
              data-tour="demo-notebook"
              ref={demoRef}
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
        </Card></nav>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua">Your library</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Notebooks <span className="font-sans text-base font-medium text-neutral-500">{notebooks.length}</span></h2>
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search notebooks</span>
              <input ref={searchRef} type="search" aria-label="Search notebooks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notebooks" className={`${inputCls} w-full pl-10`} />
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth="1.7" /><path d="m16 16 5 5" strokeWidth="1.7" /></svg>
            </label>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {visibleNotebooks.length} of {notebooks.length} notebooks shown
          </p>
          {notebooks.length === 0 ? (
            <EmptyState title="No notebooks yet — create one above." hint="Each notebook holds its own sources, research, and exports." />
          ) : visibleNotebooks.length === 0 ? (
            <div>
              <EmptyState title={`No notebooks match “${query.trim()}”.`} hint="Try another search or create a new notebook." />
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="min-h-11 rounded-lg px-3 text-xs font-medium text-aqua underline underline-offset-2 hover:text-wave"
                >
                  Clear search
                </button>
              </div>
            </div>
          ) : (
            <ul ref={listRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNotebooks.map((nb, i) => (
                <li key={nb.id}>
                  <div
                    className="group flex min-h-36 min-w-0 flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-[0_6px_25px_rgba(6,48,62,0.04)] transition-all hover:-translate-y-0.5 hover:border-aqua/50 hover:shadow-[0_16px_36px_rgba(6,48,62,0.1)] animate-card-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    // Round 21 item 4: the whole card is a pointer affordance
                    // for opening. Plain onClick only (no role/tabIndex) so
                    // keyboard is unaffected — the Open button below stays the
                    // AT/keyboard path. Inner buttons stopPropagation so they
                    // never double-fire through the card.
                    onClick={() => onOpen(nb)}
                  >
                    <button
                      type="button"
                      aria-label={`Open ${nb.name}`}
                      className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl text-left"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(nb);
                      }}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-seafoam font-display text-xl font-semibold text-wave">
                        {nb.name.trim().charAt(0).toUpperCase() || "N"}
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* Round 23 item 4: name only — the "Created {date}"
                            line clipped to "Creat…" gibberish at 1280px. */}
                        <span className="block truncate font-display text-lg font-semibold text-neutral-100">{nb.name}</span>
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                      <span className="text-xs font-semibold text-aqua">Open notebook ↗</span>
                      <button
                      type="button"
                      aria-label={confirmDeleteId === nb.id ? `Confirm delete ${nb.name}` : `Delete ${nb.name}`}
                      className="min-h-11 min-w-11 rounded-lg px-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-400 focus-visible:text-red-400"
                      onClick={(event) => {
                        // Never bubble to the card: arming/confirming a delete
                        // must not open the notebook.
                        event.stopPropagation();
                        if (confirmDeleteId === nb.id) {
                          setConfirmDeleteId(null);
                          onDelete(nb.id);
                        } else {
                          setConfirmDeleteId(nb.id);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") disarmDeleteConfirm();
                      }}
                    >
                      {confirmDeleteId === nb.id ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isLibrary && (<section className="grid gap-3 border-t border-neutral-800 pt-7 pb-8 sm:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <div key={w.title} className="border-l-2 border-aqua/40 pl-4">
              <p className="font-display text-lg font-semibold">{w.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{w.text}</p>
            </div>
          ))}
        </section>)}
      </div>
    </Tag>
  );
}
