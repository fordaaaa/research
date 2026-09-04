import { useState } from "react";
import type { SearchHit } from "../api";

interface Props {
  onSearch: (q: string) => Promise<SearchHit[]>;
}

export default function SearchPanel({ onSearch }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!query.trim()) return;
          setSearching(true);
          setError(null);
          try {
            setHits(await onSearch(query.trim()));
          } catch (err) {
            setHits([]);
            setError(err instanceof Error ? err.message : "search failed");
          } finally {
            setSearching(false);
          }
        }}
      >
        <input
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm outline-none focus:border-neutral-600"
          placeholder="Search your sources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="rounded-lg bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          type="submit"
          disabled={searching}
        >
          {searching ? "…" : "Search"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-400 text-center pt-2">{error}</p>
      )}
      {hits === null ? (
        <p className="text-sm text-neutral-600 text-center pt-6">
          Search runs entirely on your machine — no AI involved.
        </p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center pt-6">
          No matches for “{query}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {hits.map((h, i) => (
            <li
              key={`${h.source_id}-${i}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="truncate font-medium">{h.source_title}</span>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] shrink-0">
                  p. {h.pages.join(", ")}
                </span>
                <span className="ml-auto text-neutral-600 shrink-0">{h.score} hits</span>
              </div>
              <p className="mt-2 text-sm text-neutral-200 leading-relaxed">{h.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
