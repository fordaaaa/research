import { useState } from "react";
import type { SourceSummary } from "../api";
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
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function SourceList({ sources, onOpen, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteSource(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not delete source");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="text-sm text-neutral-600">No sources yet.</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((s, i) => (
            <li
              key={s.id}
              className="animate-card-in"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <SwipeRow
                actionLabel={`Source actions for ${s.title}`}
                actions={(
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-lg bg-red-950 px-3 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
                    disabled={deletingId !== null}
                    aria-label={`Delete ${s.title}`}
                    onClick={() => void deleteSource(s.id)}
                  >
                    {deletingId === s.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              >
                <div className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-neutral-900">
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button className="block min-h-11 w-full truncate text-left text-sm hover:underline" onClick={() => onOpen(s.id)}>
                      {s.title}
                    </button>
                    <p className="text-[11px] text-neutral-500">
                      {s.meta?.page_count ?? 1} page(s) · {s.chunk_count} chunks
                      {s.meta?.word_count ? ` · ${s.meta.word_count} words` : ""}
                    </p>
                  </div>
                </div>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">Delete failed: {error}</p>}
    </div>
  );
}
