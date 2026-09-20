import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import * as api from "../api";
import type { SourceDetail } from "../api";
import Spinner from "./Spinner";
import { useMountTransition } from "../useMountTransition";
import { usePrefersReducedMotion } from "../useMountTransition";

interface Props {
  sourceId: string | null;
  onClose: () => void;
}

export default function ReaderModal({ sourceId, onClose }: Props) {
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const mounted = useMountTransition(sourceId !== null, 150);
  const reducedMotion = usePrefersReducedMotion();
  const pagesLength = source?.pages.length ?? 0;

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
    api.getSource(sourceId)
      .then((next) => { if (active) setSource(next); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "could not open source"); });
    return () => { active = false; };
  }, [sourceId]);

  useEffect(() => {
    if (sourceId === null) return;
    closeRef.current?.focus();
  }, [sourceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (pagesLength === 0) return;
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPage((p) => Math.min(pagesLength - 1, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pagesLength]);

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

  return (
    <div role="dialog" aria-modal="true" aria-label={source?.title ?? "Source reader"} className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 ${open ? "animate-page-in" : "animate-fade-out pointer-events-none"}`}>
      <div className={`flex h-[min(100dvh,42rem)] max-h-[100dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-neutral-700 bg-neutral-900 shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl ${open ? "animate-pop-in" : "animate-pop-out"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 p-5">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{source?.title ?? "Loading…"}</h2>
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
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Spinner /> Opening source…
            </div>
          )}
          {page === 0 && source?.important_passages && source.important_passages.length > 0 && (
            <section className="mb-5 rounded-2xl border border-emerald-900 bg-emerald-950/50 p-4" aria-labelledby="important-passages-title">
              <div className="flex items-center justify-between gap-3">
                <h3 id="important-passages-title" className="text-sm font-semibold text-neutral-200">Important passages</h3>
                <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">local extraction · no AI</span>
              </div>
              <ol className="mt-3 space-y-3">
                {source.important_passages.map((passage) => (
                  <li key={passage.chunk_seq} className="border-l-2 border-emerald-400 pl-3">
                    <p className="text-sm leading-relaxed text-neutral-200">{passage.text}</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Page {passage.pages.join(", ") || 1} · relevance {Math.round(passage.score * 100)}%
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {current && (
            <p className={`whitespace-pre-wrap text-sm leading-relaxed text-neutral-200 ${reducedMotion ? "" : "animate-phase-in"}`} key={page}>
              {current.text}
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
