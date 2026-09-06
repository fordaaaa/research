import { useEffect, useState } from "react";
import * as api from "../api";
import type { ResearchCandidate, ResearchPlan, ResearchSynthesis } from "../api";
import Spinner from "./Spinner";

interface Props {
  notebookId: string;
  aiConfigured: boolean;
  onSourcesChanged: () => void;
}

type Phase = "topic" | "plan" | "results" | "adding" | "done";

type AddStatus = { state: "idle" | "adding" | "done" } | { state: "error"; message: string };

export default function ResearchPanel({ notebookId, aiConfigured, onSourcesChanged }: Props) {
  const [phase, setPhase] = useState<Phase>("topic");
  const [topic, setTopic] = useState("");
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addStatus, setAddStatus] = useState<Record<string, AddStatus>>({});
  const [synthesis, setSynthesis] = useState<ResearchSynthesis | null>(null);
  const [newQuery, setNewQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCandidates([]);
    setPlan(null);
    setSynthesis(null);
    setPhase("topic");
    setTopic("");
    setError(null);
  }, [notebookId]);

  useEffect(() => {
    setSelected(new Set(candidates.slice(0, 5).map((candidate) => candidate.url)));
    setAddStatus({});
  }, [candidates]);

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const runPlan = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.planResearch(notebookId, topic.trim());
      setPlan(result);
      setPhase("plan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not plan research");
    } finally {
      setBusy(false);
    }
  };

  const runGather = async () => {
    if (!plan || plan.queries.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.gatherResearch(notebookId, plan.queries);
      if (result.candidates.length === 0) {
        setError("no new sources found — try different queries");
      } else {
        setCandidates(result.candidates);
        setPhase("results");
        if (result.failed_queries.length > 0) setError(`some queries failed: ${result.failed_queries.join(", ")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not search the web");
    } finally {
      setBusy(false);
    }
  };

  const runAdd = async () => {
    const urls = candidates.filter((c) => selected.has(c.url)).map((c) => c.url);
    if (urls.length === 0 || busy) return;
    setPhase("adding");
    setAddStatus(Object.fromEntries(urls.map((url) => [url, { state: "idle" as const }])));
    let added = 0;
    for (const url of urls) {
      setAddStatus((prev) => ({ ...prev, [url]: { state: "adding" } }));
      try {
        await api.addUrl(notebookId, url);
        added += 1;
        setAddStatus((prev) => ({ ...prev, [url]: { state: "done" } }));
      } catch (err) {
        setAddStatus((prev) => ({
          ...prev,
          [url]: { state: "error", message: err instanceof Error ? err.message : "failed" },
        }));
      }
    }
    if (added > 0) onSourcesChanged();
    setPhase("done");
  };

  const runSynthesize = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.synthesizeResearch(notebookId, { topic: plan.topic, queries: plan.queries });
      setSynthesis(result);
      onSourcesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not write the overview");
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setPhase("topic");
    setPlan(null);
    setCandidates([]);
    setSynthesis(null);
    setError(null);
  };

  return (
    <section className="max-w-2xl mx-auto mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 animate-pop-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Research a topic</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Plan searches, gather public sources, and write an overview. No key needed.</p>
        </div>
        {plan && <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300">{plan.origin === "ai" ? "AI-planned" : "Quick plan"}</span>}
      </div>

      {phase === "topic" && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runPlan();
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="e.g. transformer models, the Krebs cycle…"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
            disabled={busy || topic.trim().length < 3}
            type="submit"
          >
            {busy && <Spinner size={13} />}
            {busy ? "Planning" : "Plan"}
          </button>
        </form>
      )}

      {phase === "plan" && plan && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {plan.queries.map((query) => (
              <span key={query} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-xs">
                {query}
                <button
                  className="text-neutral-500 hover:text-red-400"
                  aria-label={`Remove ${query}`}
                  onClick={() => setPlan({ ...plan, queries: plan.queries.filter((q) => q !== query) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {plan.queries.length < 6 && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const q = newQuery.trim();
                if (q && !plan.queries.some((existing) => existing.toLowerCase() === q.toLowerCase())) {
                  setPlan({ ...plan, queries: [...plan.queries, q] });
                }
                setNewQuery("");
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs outline-none focus:border-neutral-500"
                placeholder="Add a query…"
                value={newQuery}
                onChange={(event) => setNewQuery(event.target.value)}
              />
              <button className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800" type="submit">
                Add
              </button>
            </form>
          )}
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
              disabled={busy || plan.queries.length === 0}
              onClick={runGather}
            >
              {busy && <Spinner size={13} />}
              {busy ? "Searching" : "Find sources"}
            </button>
            <button className="px-2 py-2 text-xs text-neutral-500 hover:text-red-400" onClick={startOver}>
              Start over
            </button>
          </div>
        </div>
      )}

      {(phase === "results" || phase === "adding") && (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const status = addStatus[candidate.url] ?? { state: "idle" as const };
              return (
                <label
                  key={candidate.url}
                  className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(candidate.url)}
                    disabled={phase === "adding"}
                    onChange={() => toggle(candidate.url)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-neutral-200">{candidate.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{candidate.url}</span>
                    {candidate.snippet && <span className="mt-1 block text-xs leading-relaxed text-neutral-400">{candidate.snippet}</span>}
                    <span className="mt-1 block text-xs text-neutral-600">
                      score {candidate.score} · matched {candidate.matched_queries.length} quer{candidate.matched_queries.length === 1 ? "y" : "ies"}
                      {status.state === "adding" && " · adding…"}
                      {status.state === "done" && " · added"}
                      {status.state === "error" && ` · failed: ${status.message}`}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {phase === "results" && (
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
                disabled={selected.size === 0}
                onClick={runAdd}
              >
                Add {selected.size} source{selected.size === 1 ? "" : "s"}
              </button>
              <button className="px-2 py-2 text-xs text-neutral-500 hover:text-white" onClick={() => setPhase("plan")}>
                Edit queries
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && plan && (
        <div className="mt-3 space-y-3">
          {synthesis ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <p className="text-sm text-neutral-200">{synthesis.source.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {synthesis.origin === "ai" ? `written by AI (${synthesis.model})` : "structured digest — no key needed"}
              </p>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
              disabled={busy}
              onClick={runSynthesize}
            >
              {busy && <Spinner size={13} />}
              {busy ? "Writing" : aiConfigured ? "Write overview with AI" : "Write overview"}
            </button>
          )}
          {!synthesis && !aiConfigured && <p className="text-xs text-neutral-600">structured digest — no key needed</p>}
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 text-xs text-neutral-500 hover:text-white" onClick={startOver}>
              Start over
            </button>
            <button className="px-2 py-1 text-xs text-neutral-500 hover:text-white" onClick={() => setPhase("plan")}>
              Edit queries
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}
