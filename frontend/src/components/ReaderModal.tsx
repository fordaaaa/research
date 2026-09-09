import { useEffect, useState } from "react";
import * as api from "../api";
import type { SourceDetail } from "../api";
import Spinner from "./Spinner";
import { useMountTransition } from "../useMountTransition";

interface Props {
  sourceId: string | null;
  onClose: () => void;
}

export default function ReaderModal({ sourceId, onClose }: Props) {
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mounted = useMountTransition(sourceId !== null, 150);

  useEffect(() => {
    if (!sourceId) return;
    setSource(null);
    setPage(0);
    setError(null);
    api.getSource(sourceId)
      .then(setSource)
      .catch((err) => setError(err instanceof Error ? err.message : "could not open source"));
  }, [sourceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  const open = sourceId !== null;
  const pages = source?.pages ?? [];
  const current = pages[page];

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${open ? "animate-page-in" : "animate-fade-out pointer-events-none"}`}>
      <div className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl ${open ? "animate-pop-in" : "animate-pop-out"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 p-5">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{source?.title ?? "Loading…"}</h2>
            {source && (
              <p className="mt-0.5 text-xs text-neutral-500">
                {source.pages.length} page{source.pages.length === 1 ? "" : "s"} · {source.meta?.word_count ?? 0} words
              </p>
            )}
          </div>
          <button className="shrink-0 text-neutral-500 hover:text-neutral-100" onClick={onClose} aria-label="Close reader">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !source && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Spinner /> Opening source…
            </div>
          )}
          {current && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200 animate-phase-in" key={page}>
              {current.text}
            </p>
          )}
        </div>
        {pages.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-800 p-4">
            <button
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span className="text-xs text-neutral-500">
              Page {page + 1} of {pages.length}
            </span>
            <button
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
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
