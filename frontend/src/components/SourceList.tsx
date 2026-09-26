import { useEffect, useRef, useState } from "react";
import type { SourceSummary } from "../api";
import { stripMarkdownForDisplay } from "./pasteTitle";
import { SwipeRow } from "./ui";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  md: "MD",
  paste: "Pasted",
  url: "URL",
};

interface Props {
  sources: SourceSummary[];
  onOpen: (id: string, trigger?: HTMLElement | null) => void;
  onDelete: (id: string) => Promise<void>;
  /** Fired after a successful delete so the parent can retire older wins. */
  onDeleted?: () => void;
  /**
   * Win-rotation signal: when the parent fires a newer win (save/export)
   * the delete confirmation below is stale and must clear.
   */
  clearSignal?: number;
}

export default function SourceList({ sources, onOpen, onDelete, onDeleted, clearSignal }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Two-tap inline confirm: the first tap arms this row only ("Confirm?"),
  // the second tap deletes. Escape (or an explicit second tap elsewhere,
  // which re-arms that row) disarms — never blur, so keyboard and
  // focus-shifting users don't lose the armed state mid-task. There is no
  // undelete API, so a destructive tap must never fire on the first click.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // A just-deleted source awaiting focus repair once the parent list drops
  // its row. The deleted row unmounts under focus, which strands focus on
  // <body> — mirroring NotebookPicker's pendingFocus repair. The deleted
  // index is kept so focus lands on the NEXT remaining row (not the first).
  const pendingDeleteRef = useRef<{ title: string; index: number } | null>(null);
  // AbortController guards the in-flight delete against a racing refresh or
  // unmount: aborting settles to a single state with no unhandled rejection
  // and no DELETE net::ERR_ABORTED noise leaking to the console.
  const deleteAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deleteAbortRef.current?.abort();
    };
  }, []);

  function repairDeleteFocus(preferredIndex?: number) {
    // Focus survived (row still mounted or already moved): nothing to do.
    if (document.activeElement !== document.body) return;
    const root = rootRef.current;
    // Round 22 item 7: prefer the NEXT remaining Read button (the row that
    // took the deleted index, or the new last row), then the paste entry,
    // then the list heading.
    const reads = root
      ? Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Read "]'))
      : [];
    if (reads.length > 0) {
      const at = preferredIndex === undefined ? 0 : Math.min(preferredIndex, reads.length - 1);
      reads[at].focus();
      return;
    }
    // No rows left: fall back to the add-source paste entry, then the
    // list heading.
    const pasteTitle = document.getElementById("paste-title");
    if (pasteTitle instanceof HTMLElement) {
      pasteTitle.focus();
      return;
    }
    const addCard = document.querySelector('[data-tour="add-sources"]');
    if (addCard instanceof HTMLElement) {
      const entry = addCard.querySelector<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea, [tabindex]",
      );
      if (entry instanceof HTMLElement) {
        entry.focus();
        return;
      }
      addCard.focus();
      return;
    }
    const heading = root?.querySelector("h2");
    if (heading instanceof HTMLElement) heading.focus();
  }

  function scheduleDeleteFocusRepair(preferredIndex?: number) {
    const repair = () => repairDeleteFocus(preferredIndex);
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(repair));
    } else {
      repair();
    }
  }

  useEffect(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    pendingDeleteRef.current = null;
    scheduleDeleteFocusRepair(pending.index);
  }, [sources]);

  // Round 18: a refreshed list retires any armed delete confirmation, so a
  // "Confirm?" armed for a stale row can never fire after the rows changed.
  // Blur still never disarms (keyboard/focus-shifting users keep the armed
  // state mid-task); Escape at any focus inside the list disarms (see the
  // root onKeyDown below).
  const sourcesRef = useRef(sources);
  useEffect(() => {
    if (sourcesRef.current !== sources) {
      sourcesRef.current = sources;
      setConfirmId(null);
    }
  }, [sources]);

  // A newer win fired elsewhere (save/export/create): the delete
  // confirmation is stale — clear it so AT never re-hears it. The ref skips
  // the mount render so a pre-existing signal never clears a fresh win set
  // in the same flush.
  const clearSignalRef = useRef(clearSignal);
  useEffect(() => {
    if (clearSignalRef.current === clearSignal) return;
    clearSignalRef.current = clearSignal;
    setAnnouncement(null);
  }, [clearSignal]);

  async function deleteSource(id: string) {
    if (deletingId) return;
    // A new delete supersedes any in-flight one before its refresh lands.
    deleteAbortRef.current?.abort();
    const controller = new AbortController();
    deleteAbortRef.current = controller;
    const deletedTitle = sources.find((s) => s.id === id)?.title ?? "Source";
    const deletedIndex = Math.max(
      0,
      sources.findIndex((s) => s.id === id),
    );
    // Arm before the await: the parent refresh usually lands inside onDelete,
    // so the post-update effect must already see the pending title + index.
    pendingDeleteRef.current = { title: deletedTitle, index: deletedIndex };
    setDeletingId(id);
    setError(null);
    try {
      await onDelete(id);
      if (controller.signal.aborted) return;
      if (mountedRef.current) {
        setAnnouncement(`Source ${deletedTitle} deleted`);
        onDeleted?.();
        // The row may already be gone (or go away without a further sources
        // update): attempt the repair now; the [sources] effect retries once
        // the refreshed list lands.
        scheduleDeleteFocusRepair(deletedIndex);
      }
    } catch (err) {
      pendingDeleteRef.current = null;
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (mountedRef.current) setError(err instanceof Error ? err.message : "could not delete source");
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setDeletingId(null);
        setConfirmId(null);
      }
      if (deleteAbortRef.current === controller) deleteAbortRef.current = null;
    }
  }

  function handleDeleteTap(id: string) {
    if (confirmId === id) void deleteSource(id);
    else {
      setError(null);
      setConfirmId(id);
    }
  }

  // Round 24 item 5: Escape disarms AND pins focus to the arm (Delete)
  // button. Delete→Confirm→Delete is the same DOM node (label flips), so a
  // focused confirm keeps focus for free — but an Escape from anywhere else
  // (window capture) must still land focus on the arm, never leave it where
  // it was. No armed confirm in the DOM → no focus steal.
  function pinFocusToDeleteArm() {
    const scope = rootRef.current ?? document;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.getAttribute("aria-label")?.startsWith("Confirm delete")) {
      active.focus();
      return;
    }
    const candidates = Array.from(
      scope.querySelectorAll<HTMLButtonElement>('button[aria-label^="Confirm delete"]'),
    );
    if (candidates.length === 0) return;
    const inline = candidates.find((button) => button.getAttribute("data-testid") === "source-delete-inline");
    (inline ?? candidates[0]).focus();
  }

  function cancelConfirm() {
    if (deletingId === null) {
      pinFocusToDeleteArm();
      setConfirmId(null);
    }
  }

  // Round 21 item 3: the armed confirm must disarm via Escape from ANY focus
  // (mirror the tour's capture-phase pattern) — the row/root button-level
  // handlers below only fire when the confirm button itself is focused. A
  // bubble-phase listener elsewhere that stops propagation must not block
  // this, hence capture. Blur still never disarms.
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deletingId === null) {
        pinFocusToDeleteArm();
        setConfirmId(null);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletingId]);

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") cancelConfirm();
      }}
    >
      <h2 tabIndex={-1} className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 outline-none">
        Sources
      </h2>
      <p role="status" aria-label="Source announcement" className="sr-only">
        {announcement}
      </p>
      {sources.length === 0 ? (
        <p className="text-sm text-neutral-600">No sources yet.</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((s, i) => {
            const displayTitle = stripMarkdownForDisplay(s.title) || s.title;
            return (
            <li
              key={s.id}
              className="animate-card-in"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <SwipeRow
                actionLabel={`Source actions for ${displayTitle}`}
                hideToggleOnDesktop
                actions={(
                  <button
                    type="button"
                    className="min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-lg bg-red-950 px-3 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
                    disabled={deletingId !== null}
                    aria-label={confirmId === s.id ? `Confirm delete ${displayTitle}` : `Delete ${displayTitle}`}
                    onClick={() => handleDeleteTap(s.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelConfirm();
                    }}
                  >
                    {deletingId === s.id ? "Deleting…" : confirmId === s.id ? "Confirm?" : "Delete"}
                  </button>
                )}
              >
                {/* Round 19 item 2: the title gets available width — tighter
                    row gaps/padding plus a compact badge/meta footprint, and
                    up to 2 lines via line-clamp instead of single-line
                    truncate (clamped so row height stays sane). */}
                <div className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-neutral-900">
                  <span className="shrink-0 rounded bg-neutral-800 px-1 py-px text-[9px] font-semibold text-neutral-400">
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button title={displayTitle} className="block min-h-11 w-full line-clamp-2 text-left text-sm leading-snug hover:underline" onClick={(e) => onOpen(s.id, e.currentTarget)}>
                      {displayTitle}
                    </button>
                    <p className="truncate text-[10px] text-neutral-500">
                      {s.meta?.page_count ?? 1} page(s) · {s.chunk_count} chunks
                      {s.meta?.word_count ? <span className="hidden sm:inline">{` · ${s.meta.word_count} words`}</span> : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Read ${displayTitle}`}
                    data-source-id={s.id}
                    className="min-h-11 shrink-0 rounded-lg border border-neutral-700 px-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                    onClick={(e) => onOpen(s.id, e.currentTarget)}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    data-testid="source-delete-inline"
                    className="hidden min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-red-950 px-1.5 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60 sm:inline-flex sm:items-center"
                    disabled={deletingId !== null}
                    aria-label={confirmId === s.id ? `Confirm delete ${displayTitle}` : `Delete ${displayTitle}`}
                    onClick={() => handleDeleteTap(s.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelConfirm();
                    }}
                  >
                    {deletingId === s.id ? "Deleting…" : confirmId === s.id ? "Confirm?" : "Delete"}
                  </button>
                </div>
              </SwipeRow>
            </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">Delete failed: {error}</p>}
    </div>
  );
}
