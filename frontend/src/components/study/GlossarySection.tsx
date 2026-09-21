import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as api from "../../api";
import type { GlossaryEntry } from "../../api";
import Spinner from "../Spinner";
import { Button, EmptyState } from "../ui";
import { inputCls } from "../ui";

interface Props {
  notebookId: string;
  onOpenSource?: (sourceId: string) => void;
}

function pagesLabel(pages: number[]): string {
  return pages.length > 0 ? ` · p. ${pages.join(", ")}` : "";
}

export default function GlossarySection({ notebookId, onOpenSource }: Props) {
  const [entries, setEntries] = useState<GlossaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const requestRef = useRef(0);
  const notebookIdRef = useRef(notebookId);
  useLayoutEffect(() => {
    notebookIdRef.current = notebookId;
  }, [notebookId]);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestRef.current;
    setEntries(null);
    setError(null);
    setFilter("");
    setSaved(new Set());
    setSaveError(null);
    api
      .listGlossary(notebookId, 20)
      .then((result) => {
        if (!cancelled && requestRef.current === requestId) setEntries(result);
      })
      .catch((err) => {
        if (!cancelled && requestRef.current === requestId)
          setError(err instanceof Error ? err.message : "could not load glossary");
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const visible = useMemo(() => {
    if (!entries) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.term.toLowerCase().includes(q) || e.explanation.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  const reload = () => {
    const requestId = ++requestRef.current;
    const requestNotebook = notebookId;
    setEntries(null);
    setError(null);
    setSaveError(null);
    api
      .listGlossary(notebookId, 20)
      .then((result) => {
        if (requestRef.current !== requestId || notebookIdRef.current !== requestNotebook) return;
        setEntries(result);
      })
      .catch((err) => {
        if (requestRef.current !== requestId || notebookIdRef.current !== requestNotebook) return;
        setError(err instanceof Error ? err.message : "could not load glossary");
      });
  };

  const makeCard = async (entry: GlossaryEntry) => {
    if (saving) return;
    setSaving(entry.term);
    setSaveError(null);
    try {
      await api.createCard(notebookId, {
        front: entry.term,
        back: entry.explanation,
        tags: ["glossary"],
      });
      setSaved((prev) => new Set(prev).add(entry.term));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "could not create card");
    } finally {
      setSaving(null);
    }
  };

  const copyEntry = async (entry: GlossaryEntry) => {
    await navigator.clipboard.writeText(`${entry.term} — ${entry.explanation}`).catch(() => undefined);
    setCopied(entry.term);
    if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setCopied((c) => (c === entry.term ? null : c)),
      2000
    );
  };

  return (
    <section aria-label="Glossary">
      <p className="text-xs leading-relaxed text-neutral-500">
        Built locally and deterministically from your sources. No AI, no key needed.
      </p>
      {entries === null && !error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Loading glossary…
        </div>
      )}
      {error && (
        <div className="mt-3">
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
          {/no source/i.test(error) && (
            <p className="mt-1 text-xs text-neutral-500">
              Add a source with readable text first — the glossary is built only from your sources.
            </p>
          )}
          <div className="mt-2">
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        </div>
      )}
      {entries !== null && !error && entries.length === 0 && (
        <div className="mt-3">
          <EmptyState
            title="No glossary terms yet."
            hint="Add a source with readable text and reload — terms come only from your sources."
          />
          <div className="mt-2">
            <Button variant="secondary" onClick={reload}>
              Reload
            </Button>
          </div>
        </div>
      )}
      {entries !== null && !error && entries.length > 0 && (
        <div className="mt-3 space-y-2">
          <input
            className={inputCls}
            aria-label="Filter glossary"
            placeholder="Filter by term or definition…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {saveError && (
            <p role="alert" className="text-xs text-red-400">
              Could not create card: {saveError}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="text-xs text-neutral-500">No terms match “{filter}”.</p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((entry) => {
                const isSaving = saving === entry.term;
                const isSaved = saved.has(entry.term);
                return (
                  <li
                    key={`${entry.source_id}:${entry.chunk_seq}:${entry.term}`}
                    className="rounded-xl border border-neutral-800 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium">{entry.term}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{entry.explanation}</p>
                    <p className="mt-1 text-[11px] text-neutral-600">
                      From “{entry.source_title}”{pagesLabel(entry.pages)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => void makeCard(entry)}
                        disabled={isSaved || isSaving}
                      >
                        {isSaving && <Spinner size={13} />}
                        {isSaved ? "Saved to deck" : isSaving ? "Saving…" : "Make flashcard"}
                      </Button>
                      <Button variant="ghost" onClick={() => void copyEntry(entry)}>
                        {copied === entry.term ? "Copied" : "Copy"}
                      </Button>
                      {onOpenSource && (
                        <Button variant="ghost" onClick={() => onOpenSource(entry.source_id)}>
                          Open source
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
