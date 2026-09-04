import type { SourceSummary } from "../api";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  md: "MD",
  paste: "Pasted",
};

interface Props {
  sources: SourceSummary[];
  onDelete: (id: string) => Promise<void>;
}

export default function SourceList({ sources, onDelete }: Props) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        Sources
      </h2>
      {sources.length === 0 ? (
        <p className="text-sm text-neutral-600">No sources yet.</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-neutral-900"
            >
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                {KIND_LABEL[s.kind] ?? s.kind}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{s.title}</p>
                <p className="text-[11px] text-neutral-500">
                  {s.meta?.page_count ?? 1} page(s) · {s.chunk_count} chunks
                  {s.meta?.word_count ? ` · ${s.meta.word_count} words` : ""}
                </p>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-xs text-neutral-500 hover:text-red-400 transition-opacity"
                onClick={() => onDelete(s.id)}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
