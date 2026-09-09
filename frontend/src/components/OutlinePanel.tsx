import { useEffect, useState } from "react";
import * as api from "../api";
import type { OutlineDeep, OutlineReport, ResearchOutline } from "../api";
import Spinner from "./Spinner";
import { Badge, Button, Card, EmptyState, SectionHeader } from "./ui";
import { inputCls } from "./ui";

interface Props {
  notebookId: string;
  aiConfigured: boolean;
  onSourcesChanged: () => void;
}

type Phase = "pick" | "edit" | "deep" | "report";

export default function OutlinePanel({ notebookId, aiConfigured, onSourcesChanged }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [outlines, setOutlines] = useState<ResearchOutline[]>([]);
  const [outline, setOutline] = useState<ResearchOutline | null>(null);
  const [topic, setTopic] = useState("");
  const [draftOrigin, setDraftOrigin] = useState<string | null>(null);
  const [deep, setDeep] = useState<OutlineDeep | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<OutlineReport | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newField, setNewField] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhase("pick");
    setOutlines([]);
    setOutline(null);
    setTopic("");
    setDraftOrigin(null);
    setDeep(null);
    setReport(null);
    setError(null);
    api.listOutlines(notebookId).then(setOutlines).catch(() => setOutlines([]));
  }, [notebookId]);

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const startDraft = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await api.draftOutline(notebookId, topic.trim());
      const created = await api.createOutline(notebookId, {
        topic: draft.topic,
        items: draft.items.map((label) => ({ label })),
        fields: draft.fields.map((label) => ({ label })),
      });
      setOutline(created);
      setDraftOrigin(draft.origin);
      setOutlines((prev) => [...prev, created]);
      setPhase("edit");
    } catch (err) {
      fail(err, "could not draft outline");
    } finally {
      setBusy(false);
    }
  };

  const save = async (patch: { topic?: string; items?: { id: string; label: string }[]; fields?: { id: string; label: string }[] }) => {
    if (!outline) return;
    setWorking("saving");
    try {
      const next = await api.updateOutline(notebookId, outline.id, patch);
      setOutline(next);
      setOutlines((prev) => prev.map((o) => (o.id === next.id ? next : o)));
    } catch (err) {
      fail(err, "could not save outline");
    } finally {
      setWorking(null);
    }
  };

  const runDeep = async () => {
    if (!outline || outline.items.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.deepOutline(notebookId, outline.id);
      setDeep(result);
      setSelected(new Set(result.results.flatMap((r) => r.candidates.slice(0, 2).map((c) => c.url))));
      setPhase("deep");
      if (result.failed_items.length > 0) setError(`no results for: ${result.failed_items.join(", ")}`);
    } catch (err) {
      fail(err, "deep research failed");
    } finally {
      setBusy(false);
    }
  };

  const addSelected = async () => {
    if (!deep) return;
    const urls = deep.results.flatMap((r) => r.candidates.map((c) => c.url)).filter((u) => selected.has(u));
    if (urls.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    let added = 0;
    for (const url of urls) {
      try {
        await api.addUrl(notebookId, url);
        added += 1;
      } catch {
        // per-URL failures are tolerated; the report still covers what landed
      }
    }
    if (added > 0) onSourcesChanged();
    setBusy(false);
    setPhase("report");
  };

  const runReport = async () => {
    if (!outline || busy) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await api.reportOutline(notebookId, outline.id));
      onSourcesChanged();
    } catch (err) {
      fail(err, "could not write the report");
    } finally {
      setBusy(false);
    }
  };

  const openOutline = (o: ResearchOutline) => {
    setOutline(o);
    setDraftOrigin(null);
    setDeep(null);
    setReport(null);
    setError(null);
    setPhase("edit");
  };

  return (
    <Card className="p-5 animate-pop-in">
      <SectionHeader
        title="Deep research"
        sub="Draft an outline of items and fields, research each item, then write a structured report. No key needed."
        right={draftOrigin ? <Badge>{draftOrigin === "ai" ? "AI-drafted" : "Quick draft"}</Badge> : undefined}
      />

      {phase === "pick" && (
        <div className="mt-4 space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              startDraft();
            }}
          >
            <input
              className={inputCls}
              placeholder="e.g. AI Agent Demo 2025…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Button type="submit" disabled={busy || topic.trim().length < 3} className="shrink-0">
              {busy && <Spinner size={13} />}
              {busy ? "Drafting" : "Draft outline"}
            </Button>
          </form>
          {outlines.length === 0 ? (
            <EmptyState title="No outlines yet — draft one above." hint="Each outline keeps its own items, fields, and report." />
          ) : (
            <ul className="space-y-1.5">
              {outlines.map((o) => (
                <li key={o.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 px-3 py-2.5 hover:border-neutral-600">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openOutline(o)}>
                    <span className="block truncate text-sm font-medium">{o.topic}</span>
                    <span className="text-xs text-neutral-500">
                      {o.items.length} item{o.items.length === 1 ? "" : "s"} · {o.fields.length} field{o.fields.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <button
                    className="shrink-0 text-xs text-neutral-600 hover:text-red-400"
                    onClick={async () => {
                      await api.deleteOutline(notebookId, o.id);
                      setOutlines((prev) => prev.filter((x) => x.id !== o.id));
                    }}
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === "edit" && outline && (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Items to investigate ({outline.items.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {outline.items.map((item) => (
                <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-xs">
                  {item.label}
                  <button
                    className="text-neutral-500 hover:text-red-400"
                    aria-label={`Remove ${item.label}`}
                    onClick={() => save({ items: outline.items.filter((i) => i.id !== item.id) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const label = newItem.trim();
                if (!label) return;
                save({ items: [...outline.items, { id: `new-${Date.now()}`, label }] });
                setNewItem("");
              }}
            >
              <input className={inputCls} placeholder="Add an item…" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!newItem.trim() || working !== null}>Add</Button>
            </form>
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Fields per item ({outline.fields.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {outline.fields.map((field) => (
                <span key={field.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
                  {field.label}
                  <button
                    className="text-neutral-500 hover:text-red-400"
                    aria-label={`Remove ${field.label}`}
                    onClick={() => save({ fields: outline.fields.filter((f) => f.id !== field.id) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const label = newField.trim();
                if (!label) return;
                save({ fields: [...outline.fields, { id: `new-${Date.now()}`, label }] });
                setNewField("");
              }}
            >
              <input className={inputCls} placeholder="Add a field…" value={newField} onChange={(e) => setNewField(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!newField.trim() || working !== null}>Add</Button>
            </form>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={runDeep} disabled={busy || outline.items.length === 0}>
              {busy && <Spinner size={13} />}
              {busy ? "Researching" : `Research ${outline.items.length} item${outline.items.length === 1 ? "" : "s"}`}
            </Button>
            <Button variant="ghost" onClick={() => setPhase("pick")}>All outlines</Button>
          </div>
        </div>
      )}

      {phase === "deep" && deep && (
        <div className="mt-4 space-y-4">
          {deep.results.map((group) => (
            <div key={group.item_id} className="rounded-xl border border-neutral-800 p-3">
              <p className="text-sm font-medium">{group.label}</p>
              <p className="mt-0.5 text-xs text-neutral-600">{group.queries.join(" · ")}</p>
              <div className="mt-2 space-y-1.5">
                {group.candidates.length === 0 && (
                  <p className="text-xs text-neutral-500">No candidates for this item.</p>
                )}
                {group.candidates.map((c) => (
                  <label key={c.url} className="flex items-start gap-2.5 rounded-lg bg-neutral-900/60 p-2.5 hover:bg-neutral-900">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 appearance-none rounded border border-neutral-600 bg-neutral-950 checked:border-neutral-100 checked:bg-neutral-100"
                      checked={selected.has(c.url)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.url)) next.delete(c.url);
                          else next.add(c.url);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-neutral-200">{c.title}</span>
                      <span className="block truncate text-[11px] text-neutral-500">{c.url}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button onClick={addSelected} disabled={busy || selected.size === 0}>
              {busy && <Spinner size={13} />}
              {busy ? "Adding" : `Add ${selected.size} source${selected.size === 1 ? "" : "s"} & continue`}
            </Button>
            <Button variant="ghost" onClick={() => setPhase("edit")}>Edit outline</Button>
          </div>
        </div>
      )}

      {phase === "report" && (
        <div className="mt-4 space-y-3">
          {report ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <p className="text-sm text-neutral-200">{report.source.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {report.origin === "ai" ? `written by AI (${report.model})` : "structured report — no key needed"}
              </p>
            </div>
          ) : (
            <>
              <Button onClick={runReport} disabled={busy}>
                {busy && <Spinner size={13} />}
                {busy ? "Writing" : aiConfigured ? "Write report with AI" : "Write report"}
              </Button>
              {!aiConfigured && <p className="text-xs text-neutral-600">structured digest grouped by your outline — no key needed</p>}
            </>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setPhase("pick")}>All outlines</Button>
            <Button variant="ghost" onClick={() => setPhase("edit")}>Edit outline</Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </Card>
  );
}
