import { useState } from "react";
import { searchWeb } from "../api";
import type { SearchHit, WebSearchResult } from "../api";
import Spinner from "./Spinner";

interface Props {
  onSearch: (q: string) => Promise<SearchHit[]>;
  onImportUrl: (url: string) => Promise<void>;
}

export default function SearchPanel({ onSearch, onImportUrl }: Props) {
  const [mode, setMode] = useState<"sources" | "web">("sources");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [webResults, setWebResults] = useState<WebSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      if (mode === "sources") {
        setHits(await onSearch(query.trim()));
      } else {
        setWebResults(await searchWeb(query.trim()));
      }
    } catch (err) {
      if (mode === "sources") setHits([]);
      else setWebResults([]);
      setError(err instanceof Error ? err.message : "search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-page-in">
      <div className="flex gap-1 rounded-lg bg-neutral-900 p-1 w-fit">
        {(["sources", "web"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === option ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-200"}`}
            onClick={() => {
              setMode(option);
              setError(null);
            }}
          >
            {option === "sources" ? "Your sources" : "Search the web"}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await submitSearch();
        }}
      >
        <input
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm outline-none focus:border-neutral-600"
          placeholder={mode === "sources" ? "Search your sources…" : "Search the web…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          type="submit"
          disabled={searching}
        >
          {searching && <Spinner size={13} />}
          Search
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-400 text-center pt-2">{error}</p>
      )}
      {mode === "sources" && hits === null ? (
        <p className="text-sm text-neutral-600 text-center pt-6">
          Search runs entirely on your machine — no AI involved.
        </p>
      ) : mode === "sources" && hits?.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center pt-6">
          No matches for “{query}”.
        </p>
      ) : mode === "sources" && hits ? (
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
      ) : webResults === null ? (
        <p className="text-sm text-neutral-600 text-center pt-6">
          Find a public page, then add it as a local source. No API key needed.
        </p>
      ) : webResults.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center pt-6">No public results for “{query}”.</p>
      ) : (
        <ul className="space-y-2">
          {webResults.map((result) => (
            <li key={result.url} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 animate-card-in">
              <a className="text-sm font-medium text-neutral-100 hover:underline" href={result.url} target="_blank" rel="noreferrer">
                {result.title}
              </a>
              <p className="mt-1 text-xs text-neutral-500 truncate">{result.url}</p>
              {result.snippet && <p className="mt-2 text-sm leading-relaxed text-neutral-300">{result.snippet}</p>}
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
                disabled={importing === result.url}
                onClick={async () => {
                  setImporting(result.url);
                  setError(null);
                  try {
                    await onImportUrl(result.url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "could not add source");
                  } finally {
                    setImporting(null);
                  }
                }}
              >
                {importing === result.url && <Spinner size={12} />}
                {importing === result.url ? "Adding" : "Add to notebook"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
