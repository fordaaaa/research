import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import * as api from "../api";
import type { Note, SourceDetail } from "../api";
import FolioLoader from "./FolioLoader";
import { stripMarkdownForDisplay, stripTitleEcho } from "./pasteTitle";
import { useMountTransition } from "../useMountTransition";
import { usePrefersReducedMotion } from "../useMountTransition";

interface Props {
  sourceId: string | null;
  onClose: () => void;
  onEvidenceSaved?: (note: Note) => void;
  onViewNotes?: () => void;
  /**
   * Round 20 item 1: the opener, captured synchronously in the click handler
   * (e.currentTarget) BEFORE setOpen. null = opener-less open, restore to
   * #main-content. undefined (omitted) = legacy mount-time capture + Read
   * button re-query fallback.
   */
  trigger?: HTMLElement | null;
}

export default function ReaderModal({ sourceId, onClose, onEvidenceSaved, onViewNotes, trigger }: Props) {
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingSeq, setSavingSeq] = useState<number | null>(null);
  const [savedSeqs, setSavedSeqs] = useState<number[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savedTriggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const mounted = useMountTransition(sourceId !== null, 150);
  const reducedMotion = usePrefersReducedMotion();
  const pagesLength = source?.pages.length ?? 0;
  const pagesLengthRef = useRef(pagesLength);
  pagesLengthRef.current = pagesLength;

  useEffect(() => {
    if (sourceId === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    setSource(null);
    setPage(0);
    setError(null);
    setSaveError(null);
    setSavedSeqs([]);
    api.getSource(sourceId)
      .then((next) => { if (active) setSource(next); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "could not open source"); });
    return () => { active = false; };
  }, [sourceId]);

  // Mirror FirstRunTour: inert the landmarks behind the dialog while open
  // so background links stay untabbable. Declared BEFORE the focus
  // capture/restore effect so that on close the inert attribute is removed
  // BEFORE focus is restored — otherwise the trigger is still inert and the
  // restore is lost to BODY.
  useEffect(() => {
    if (sourceId === null) return;
    const root = dialogRef.current;
    const background = Array.from(
      document.querySelectorAll("header, main, nav, aside"),
    ).filter((element) => !root?.contains(element) && !element.contains(root));
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => {
      background.forEach((element) => element.removeAttribute("inert"));
    };
  }, [sourceId]);

  // Round 19 item 3: the opener element often unmounts during the read
  // (list refresh), so the saved node alone strands focus on the H2 fallback
  // and never the Read button. Record the source id + display title at open;
  // on close, re-query button[aria-label="Read {title}"] (or data-source-id)
  // and focus it when present — H2, then #main-content, only on no match.
  const openedSourceRef = useRef<{ id: string; title: string | null }>({ id: "", title: null });
  useEffect(() => {
    if (sourceId === null) return;
    openedSourceRef.current = { id: sourceId, title: null };
  }, [sourceId]);
  useEffect(() => {
    if (source) {
      openedSourceRef.current.title = stripMarkdownForDisplay(source.title) || source.title;
    }
  }, [source]);

  function focusReadButtonForOpenedSource(): boolean {
    const { id, title } = openedSourceRef.current;
    if (id) {
      const byId = document.querySelector(`button[data-source-id="${CSS.escape(id)}"]`);
      if (byId instanceof HTMLElement) {
        byId.focus();
        return true;
      }
    }
    if (title) {
      const wanted = `Read ${title}`;
      const match = Array.from(document.querySelectorAll('button[aria-label^="Read "]')).find(
        (button) => button.getAttribute("aria-label") === wanted,
      );
      if (match instanceof HTMLElement) {
        match.focus();
        return true;
      }
    }
    return false;
  }

  // The opener is set synchronously with the open state, so the
  // effect-closure `trigger` value below is exact (no render-time ref sync).
  const triggerProvided = trigger !== undefined;
  useEffect(() => {
    if (sourceId === null || !mounted) return;
    if (!triggerProvided && savedTriggerRef.current === null) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // An opener-less open (activeElement is BODY) leaves the ref null so
      // dismiss falls back to a heading instead of a dead node.
      savedTriggerRef.current = active && active !== document.body ? active : null;
    }
    // Initial focus goes to the close button: actionable, visibly focused,
    // and unambiguous for screen-reader users (the dialog keeps its
    // aria-labelledby heading for context).
    closeRef.current?.focus();
    return () => {
      // Explicit trigger path (round 20 item 1): restore to the passed
      // trigger if connected, else #main-content. Legacy path (undefined):
      // keep the Read-button re-query + Sources H2 fallbacks.
      if (triggerProvided) {
        const explicit = trigger ?? null;
        if (explicit && explicit.isConnected && document.contains(explicit)) {
          explicit.focus();
        } else {
          document.getElementById("main-content")?.focus?.();
        }
        savedTriggerRef.current = null;
        return;
      }
      const saved = savedTriggerRef.current;
      // Mirror FirstRunTour/SettingsDialog: the opener may have unmounted
      // during the read (list refresh), so only reuse a trigger still
      // connected to the DOM. Otherwise fall back to the Sources H2, then
      // #main-content, so focus never strands on BODY on any close path
      // (Esc, ×, scrim).
      if (saved && saved.isConnected && document.contains(saved)) {
        saved.focus();
      } else if (!focusReadButtonForOpenedSource()) {
        const sourcesHeading = Array.from(document.querySelectorAll("h2")).find(
          (heading) => heading.textContent?.trim() === "Sources",
        );
        if (sourcesHeading instanceof HTMLElement) sourcesHeading.focus();
        else document.getElementById("main-content")?.focus?.();
      }
      savedTriggerRef.current = null;
    };
    // Opener fixed synchronously with the open state: closure values exact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, mounted]);

  useEffect(() => {
    // Capture-phase on window (like FirstRunTour/SettingsDialog on
    // document): fires for events targeted at window, document, or any
    // node below, and dismisses even if an inner control stops propagation.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Mirror FirstRunTour's trap: cycle Tab within the dialog so focus
      // never escapes to the scrimmed background behind aria-modal.
      if (e.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!dialogRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      const count = pagesLengthRef.current;
      if (count === 0) return;
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPage((p) => Math.min(count - 1, p + 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sourceId]);

  if (!mounted) return null;
  const open = sourceId !== null;
  const pages = source?.pages ?? [];
  const current = pages[page];

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (window.getSelection()?.toString()) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || window.getSelection()?.toString()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy)) return;
    setPage((p) => dx < 0 ? Math.min(pages.length - 1, p + 1) : Math.max(0, p - 1));
  }

  async function savePassage(passage: NonNullable<SourceDetail["important_passages"]>[number]) {
    if (!source || savingSeq !== null) return;
    setSavingSeq(passage.chunk_seq);
    setSaveError(null);
    const pageLabel = passage.pages.join(", ") || "1";
    const titlePageLabel = pageLabel.length > 40 ? `${pageLabel.slice(0, 37)}…` : pageLabel;
    const titleSuffix = `, p. ${titlePageLabel}`;
    const titlePrefix = "Evidence from ";
    try {
      const created = await api.createNote(source.notebook_id, {
        title: `${titlePrefix}${source.title.slice(0, 200 - titlePrefix.length - titleSuffix.length)}${titleSuffix}`,
        body: `${passage.text.split("\n").map((line) => `> ${line}`).join("\n")}\n\nSource: ${source.title}, p. ${pageLabel}`,
        citations: [{ source_id: source.id, chunk_seq: passage.chunk_seq }],
      });
      setSavedSeqs((current) => [...current, passage.chunk_seq]);
      onEvidenceSaved?.(created);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save passage");
    } finally {
      setSavingSeq(null);
    }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reader-title" aria-label={source ? stripMarkdownForDisplay(source.title) || source.title : "Source reader"} className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 ${open ? "animate-page-in" : "animate-fade-out pointer-events-none"}`}>
      <div className={`flex h-[min(100dvh,42rem)] max-h-[100dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-neutral-700 bg-neutral-900 shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl ${open ? "animate-pop-in" : "animate-pop-out"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 p-5">
          <div className="min-w-0">
            <h2 id="reader-title" title={source ? stripMarkdownForDisplay(source.title) || source.title : undefined} className="truncate font-semibold">{source ? stripMarkdownForDisplay(source.title) || source.title : "Loading…"}</h2>
            {source && (
              <>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {source.pages.length} page{source.pages.length === 1 ? "" : "s"} · {source.meta?.word_count ?? 0} words
                </p>
                {(source.site_name || source.byline || source.published) && (
                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {[source.site_name, source.byline, source.published].filter(Boolean).join(" · ")}
                  </p>
                )}
              </>
            )}
          </div>
          <button ref={closeRef} className="min-h-11 min-w-11 shrink-0 rounded-lg px-2 text-lg leading-none text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100" onClick={onClose} aria-label="Close reader">×</button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto p-5"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipeStart.current = null; }}
        >
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !source && (
            <FolioLoader compact title={sourceId ? "Opening source…" : "Loading…"} stages={["Laying folio flat…", "Linking excerpts…", "Settling citation marker…"]} />
          )}
          {page === 0 && source?.important_passages && source.important_passages.length > 0 && (
            <section className="mb-5 rounded-2xl border border-emerald-900 bg-emerald-950/50 p-4" aria-labelledby="important-passages-title">
              <div className="flex items-center justify-between gap-3">
                <h3 id="important-passages-title" className="text-sm font-semibold text-neutral-200">Important passages</h3>
                <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">local extraction · no AI</span>
              </div>
              <ol className="mt-3 space-y-3">
                {source.important_passages.map((passage, index) => (
                  <li key={`${passage.chunk_seq}-${index}`} className="border-l-2 border-emerald-400 pl-3">
                    <p className="text-sm leading-relaxed text-neutral-200">{passage.text}</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Page {passage.pages.join(", ") || 1} · relevance {Math.round(passage.score * 100)}%
                    </p>
                    <button
                      type="button"
                      className="mt-2 min-h-11 rounded-lg border border-neutral-700 px-3 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                      disabled={savingSeq !== null || savedSeqs.includes(passage.chunk_seq)}
                      onClick={() => savePassage(passage)}
                    >
                      {savedSeqs.includes(passage.chunk_seq) ? "Saved to notes" : savingSeq === passage.chunk_seq ? "Saving…" : "Save passage to notes"}
                    </button>
                  </li>
                ))}
              </ol>
              {savedSeqs.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-3">
                  <p className="text-xs text-neutral-500">Saved {savedSeqs.length} passage{savedSeqs.length === 1 ? "" : "s"}. Add more or continue writing.</p>
                  {onViewNotes && <button type="button" className="min-h-11 rounded-lg bg-aqua px-4 text-xs font-semibold text-neutral-950" onClick={onViewNotes}>View notes →</button>}
                </div>
              )}
              {saveError && <p role="alert" className="mt-3 text-xs text-red-400">{saveError}</p>}
            </section>
          )}
          {current && (
            <p className={`whitespace-pre-wrap text-sm leading-relaxed text-neutral-200 ${reducedMotion ? "" : "animate-phase-in"}`} key={page}>
              {source ? stripTitleEcho(source.title, stripMarkdownForDisplay(current.text) || current.text) : stripMarkdownForDisplay(current.text) || current.text}
            </p>
          )}
        </div>
        {pages.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-800 p-4">
            <button
              className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span className="text-xs text-neutral-500">
              Page {page + 1} of {pages.length}
            </span>
            <button
              className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
              disabled={page >= pages.length - 1}
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
