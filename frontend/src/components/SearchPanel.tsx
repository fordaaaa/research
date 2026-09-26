import { useEffect, useRef, useState } from "react";
import { friendlySearchError, searchWeb } from "../api";
import type { SearchHit, WebSearchResult } from "../api";
import Spinner from "./Spinner";
import ThinkingDots from "./ThinkingDots";
import { EmptyState, Skeleton } from "./ui";
import { stripMarkdownForDisplay, stripTitleEcho } from "./pasteTitle";

export { stripTitleEcho };

interface Props {
  onSearch: (q: string, signal?: AbortSignal) => Promise<SearchHit[]>;
  onImportUrl: (url: string) => Promise<void>;
  onSearched?: () => void;
  /**
   * Round 18: sources-count token (App passes sources.length). When it
   * changes, shown source-results are stale (e.g. "1 passage across 1
   * source" beside an empty library) and clear. Counting — not a refresh
   * epoch — is deliberate: unrelated refreshes that leave the count
   * unchanged keep in-progress searches intact; only added/removed
   * sources wipe results.
   */
  /**
   * Round 23 item 5: optional reader opener. When provided, each grouped
   * hit's title is itself a button that opens the reader (previously dead
   * text with no way to open the source from search results).
   */
  onOpenSource?: (sourceId: string, trigger?: HTMLElement | null) => void;
  sourcesVersion?: number;
}

/** Minimum non-space characters before an auto-search may fire. */
const AUTO_SEARCH_MIN_CHARS = 2;
/** Debounce delay for typing-driven auto-search in sources mode. */
const AUTO_SEARCH_DELAY_MS = 400;

interface HitGroup {
  primary: SearchHit;
  others: SearchHit[];
}

interface SourceGroup {
  sourceId: string;
  title: string;
  groups: HitGroup[];
}

/** Display-only grouping of snippet-deduped rows by source: a source header
 * row (title + count) with its hits beneath. Order follows first appearance;
 * the result count still reports true totals. */
function groupBySource(groups: HitGroup[]): SourceGroup[] {
  const ordered: SourceGroup[] = [];
  const index = new Map<string, SourceGroup>();
  for (const group of groups) {
    const existing = index.get(group.primary.source_id);
    if (existing) existing.groups.push(group);
    else {
      const entry: SourceGroup = {
        sourceId: group.primary.source_id,
        title: group.primary.source_title,
        groups: [group],
      };
      index.set(group.primary.source_id, entry);
      ordered.push(entry);
    }
  }
  return ordered;
}

/** Groups hits with identical snippet text so a passage triplicated across
 * sources renders once with an honest "also appears in" note. Order follows
 * first appearance; the result count still reports true totals. Round 24
 * item 6: the key is normalized (trim + collapse whitespace + lowercase)
 * so trivial case/space variants group; display keeps the original text. */
function groupHitsBySnippet(hits: SearchHit[]): HitGroup[] {
  const groups: HitGroup[] = [];
  const index = new Map<string, HitGroup>();
  for (const hit of hits) {
    const key = hit.snippet.trim().replace(/\s+/g, " ").toLowerCase();
    const existing = index.get(key);
    if (existing) existing.others.push(hit);
    else {
      const group: HitGroup = { primary: hit, others: [] };
      index.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}

export default function SearchPanel({ onSearch, onImportUrl, onSearched, onOpenSource, sourcesVersion }: Props) {
  const [mode, setMode] = useState<"sources" | "web">("sources");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [webResults, setWebResults] = useState<WebSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guards the live search: only the latest fired request may write results.
  const liveSearchSeq = useRef(0);
  const liveAbort = useRef<AbortController | null>(null);
  // Single-flight guard: the pending debounce timer handle (so an explicit
  // submit can cancel it) plus the "mode:query" of the last settled search
  // (so a submit right after an auto-search does not re-fire it).
  const debounceTimer = useRef<number | null>(null);
  const settledSearch = useRef<string | null>(null);
  // Latest callbacks by ref: App passes fresh inline lambdas on every
  // render, and depending on their identity here would re-arm the debounce
  // timer (a second identical GET) for a query that already settled.
  const onSearchRef = useRef(onSearch);
  const onSearchedRef = useRef(onSearched);
  useEffect(() => {
    onSearchRef.current = onSearch;
    onSearchedRef.current = onSearched;
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Round 18 item 2: the library changed under these results (sources
  // added/removed) — drop stale source hits so the count never describes a
  // library that no longer exists. Web results are unaffected.
  const sourcesVersionRef = useRef(sourcesVersion);
  useEffect(() => {
    if (sourcesVersion === undefined) return;
    if (sourcesVersionRef.current === sourcesVersion) return;
    sourcesVersionRef.current = sourcesVersion;
    setHits(null);
    setError(null);
    settledSearch.current = null;
  }, [sourcesVersion]);

  // Typing alone searches in "sources" mode only: debounced, with a minimum
  // query length, aborting superseded requests. Web mode stays explicit
  // (button/Enter) because every search costs network.
  useEffect(() => {
    if (mode !== "sources") return;
    const trimmed = query.trim();
    if (trimmed.replace(/\s/g, "").length < AUTO_SEARCH_MIN_CHARS) return;
    const seq = ++liveSearchSeq.current;
    const controller = new AbortController();
    liveAbort.current?.abort();
    liveAbort.current = controller;
    // Settled-flag: once cleanup runs (StrictMode remount, query/mode
    // change, unmount), this run is stale — its late completion must not
    // write state even if the abort signal was missed.
    let settled = false;
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      void (async () => {
        if (settled || controller.signal.aborted) return;
        setSearching(true);
        setError(null);
        onSearchedRef.current?.();
        try {
          const results = await onSearchRef.current(trimmed, controller.signal);
          if (!settled && liveSearchSeq.current === seq && !controller.signal.aborted) {
            setHits(results);
            settledSearch.current = `sources:${trimmed}`;
          }
        } catch (err) {
          if (settled || controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          if (liveSearchSeq.current === seq) {
            setHits([]);
            setError(friendlySearchError(err));
          }
        } finally {
          if (!settled && liveSearchSeq.current === seq) setSearching(false);
        }
      })();
    }, AUTO_SEARCH_DELAY_MS);
    return () => {
      settled = true;
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      controller.abort();
    };
  }, [query, mode]);

  // Mode switches replace the results below: move focus to the panel
  // heading and announce the switch so screen-reader users land on it.
  function selectMode(next: "sources" | "web") {
    // A pending auto-search must not fire after leaving sources mode.
    liveSearchSeq.current += 1;
    liveAbort.current?.abort();
    setMode(next);
    setError(null);
    setAnnouncement(next === "sources" ? "Showing your sources search" : "Showing web search");
    headingRef.current?.focus();
  }

  async function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    // An explicit submit supersedes any pending auto-search: cancel its
    // timer so one gesture settles exactly one request.
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    liveSearchSeq.current += 1;
    liveAbort.current?.abort();
    // The auto-search may have already settled this exact query — results
    // are on screen, so re-firing would only double the requests.
    if (settledSearch.current === `${mode}:${trimmed}`) return;
    setSearching(true);
    setError(null);
    onSearched?.();
    try {
      if (mode === "sources") {
        setHits(await onSearch(trimmed));
      } else {
        setWebResults(await searchWeb(trimmed));
      }
      settledSearch.current = `${mode}:${trimmed}`;
    } catch (err) {
      if (mode === "sources") setHits([]);
      else setWebResults([]);
      setError(friendlySearchError(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-page-in">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
        {mode === "sources" ? "Search your sources" : "Search the web"}
      </h2>
      <p role="status" aria-label="Search mode announcement" className="sr-only">
        {announcement}
      </p>
      <div className="flex gap-1 rounded-lg bg-neutral-900 p-1 w-fit">
        {(["sources", "web"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === option ? "bg-neutral-100 text-neutral-950" : "text-neutral-500 hover:text-neutral-200"}`}
            onClick={() => selectMode(option)}
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
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label={mode === "sources" ? "Search your sources" : "Search the web"}
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm outline-none focus:border-neutral-500"
          placeholder={mode === "sources" ? "Search your sources…" : "Search the web…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-200 transition active:scale-[0.98] disabled:opacity-50"
          type="submit"
          // The nav tab is also named "Search" — the submit keeps its
          // visible text but carries a unique accessible name so name
          // queries never collide.
          aria-label="Submit search"
          disabled={searching}
        >
          {searching && <ThinkingDots state="searching" theme="dark" />}
          Search
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-400 text-center pt-2">{error}</p>
      )}
      {searching && (
        <div className="space-y-2 pt-2">
          <Skeleton lines={3} />
          <p className="text-sm text-neutral-500 text-center">Searching…</p>
        </div>
      )}
      {mode === "sources" && hits === null && !searching ? (
        <p className="text-sm text-neutral-600 text-center pt-6">
          Search runs entirely on your machine — no AI involved.
        </p>
      ) : mode === "sources" && hits ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500" role="status" aria-label="Search result count">
            {hits.length} passage{hits.length === 1 ? "" : "s"} across {new Set(hits.map((h) => h.source_id)).size} source{new Set(hits.map((h) => h.source_id)).size === 1 ? "" : "s"}
          </p>
          {hits.length === 0 ? (
            <div className="space-y-3 pt-6 text-center">
              <EmptyState
                title={`No matches for “${query}”.`}
                hint="Try fewer words or a different term — or clear and start over."
              />
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                  onClick={() => {
                    setQuery("");
                    setHits(null);
                  }}
                >
                  Clear search
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                  onClick={() => {
                    selectMode("web");
                  }}
                >
                  Search the web instead
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupBySource(groupHitsBySnippet(hits)).map((source) => (
                <section key={source.sourceId} data-testid="search-source-group" aria-label={`Results from ${stripMarkdownForDisplay(source.title) || source.title}`}>
                  <h3 className="truncate text-xs font-semibold text-neutral-300">
                    {stripMarkdownForDisplay(source.title) || source.title} ({source.groups.length})
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {source.groups.map((group, i) => {
                      const h = group.primary;
                      const otherNames = [...new Set(group.others.map((o) => stripMarkdownForDisplay(o.source_title) || o.source_title))];
                      return (
                        <li
                          key={`${h.source_id}-${i}`}
                          className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/80 animate-card-in"
                          style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                        >
                          <div className="flex items-center gap-2 text-xs text-neutral-400">
                            {(() => {
                              const displayTitle = stripMarkdownForDisplay(h.source_title) || h.source_title;
                              return onOpenSource ? (
                                <button
                                  type="button"
                                  aria-label={`Read ${displayTitle}`}
                                  className="truncate text-left font-medium text-neutral-200 hover:underline"
                                  onClick={(e) => onOpenSource(h.source_id, e.currentTarget)}
                                >
                                  {displayTitle}
                                </button>
                              ) : (
                                <span className="truncate font-medium">{displayTitle}</span>
                              );
                            })()}
                            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] shrink-0">
                              p. {h.pages.join(", ")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-neutral-200 leading-relaxed">{stripTitleEcho(h.source_title, h.snippet)}</p>
                          {group.others.length > 0 && (
                            <p className="mt-2 text-xs text-neutral-500">
                              Also appears in {group.others.length} other source{group.others.length === 1 ? "" : "s"}: {otherNames.join(", ")}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : webResults === null ? (
        <p className="text-sm text-neutral-600 text-center pt-6">
          Find a public page, then add it as a local source. No API key needed.
        </p>
      ) : webResults.length === 0 ? (
        <div className="space-y-3 pt-6 text-center">
          {/* Round 25 item 3: the sources empty branch announces its honest
              zero count ("0 passages…"); web had no count region at all, so
              an empty web search was SR-silent. Announce the zero count here
              too — focus correctly stays in the input, announce only. */}
          <p role="status" aria-label="Web search result count" className="sr-only">
            0 public results for &ldquo;{query}&rdquo;.
          </p>
          <EmptyState
            title={`No public results for “${query}”.`}
            hint="Try a different term — adding a source works without any key."
          />
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => {
                setQuery("");
                setWebResults(null);
              }}
            >
              Clear search
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => {
                selectMode("sources");
              }}
            >
              Search your sources
            </button>
          </div>
        </div>
      ) : (
        // Parity with sources mode: a visible count header in a named live
        // region (sources: "N passages across M sources" in "Search result
        // count"). The empty zero-count stays announced (sr-only branch
        // above); non-empty results get the same treatment, visible.
        <div className="space-y-2">
          <p className="text-xs text-neutral-500" role="status" aria-label="Web search result count">
            {webResults.length} public result{webResults.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
          {webResults.map((result, i) => (
            <li key={result.url} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/80 animate-card-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <a className="text-sm font-medium text-neutral-100 hover:underline" href={result.url} target="_blank" rel="noreferrer">
                {stripMarkdownForDisplay(result.title) || result.title}
              </a>
              <p className="mt-1 text-xs text-neutral-500 truncate">{result.url}</p>
              {result.snippet && <p className="mt-2 text-sm leading-relaxed text-neutral-300">{stripMarkdownForDisplay(result.snippet) || result.snippet}</p>}
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200 transition active:scale-[0.98] disabled:opacity-50"
                disabled={importing === result.url}
                onClick={async () => {
                  setImporting(result.url);
                  setError(null);
                  try {
                    await onImportUrl(result.url);
                  } catch (err) {
                    setError(friendlySearchError(err, "could not add source"));
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
        </div>
      )}
    </div>
  );
}
