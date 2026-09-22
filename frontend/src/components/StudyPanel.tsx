import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import type { CardSuggestion, Flashcard, MindmapNode } from "../api";
import Spinner from "./Spinner";
import ThinkingDots from "./ThinkingDots";
import { Button, Card, EmptyState, SectionHeader, Tabs } from "./ui";
import { inputCls } from "./ui";
import ReviewSession from "./study/ReviewSession";
import GlossarySection from "./study/GlossarySection";
import QuizSection from "./study/QuizSection";
import { formatCardTags, parseCardTags } from "./study/cardTags";

interface Props {
  notebookId: string;
  onSourcesChanged: () => void;
  onOpenSource?: (sourceId: string) => void;
}

type Section = "cards" | "glossary" | "quiz" | "guide" | "map";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function StudyPanel({ notebookId, onSourcesChanged, onOpenSource }: Props) {
  const [section, setSection] = useState<Section>("cards");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // persisted spaced-review session (grades POST to the backend)
  const [reviewQueue, setReviewQueue] = useState<Flashcard[] | null>(null);
  // source-grounded drafts (never saved until the user chooses Save)
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<Set<string>>(new Set());
  const [savingDraft, setSavingDraft] = useState<string | null>(null);
  const notebookIdRef = useRef(notebookId);
  useLayoutEffect(() => {
    notebookIdRef.current = notebookId;
  }, [notebookId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDeleteError(null);
    setEditError(null);
    setExportError(null);
    setReviewQueue(null);
    setSuggestions([]);
    setSuggestionsLoaded(false);
    setSuggestionsError(null);
    setSavedDrafts(new Set());
    setFilter("");
    setEditingId(null);
    api.listCards(notebookId).then((result) => {
      if (!cancelled) setCards(result);
    }).catch(() => {
      if (!cancelled) setCards([]);
    });
    api.listDueCards(notebookId).then((result) => {
      if (!cancelled) setDueCards(result);
    }).catch(() => {
      if (!cancelled) setDueCards([]);
    });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const refresh = async () => {
    const requestNotebook = notebookId;
    const [all, due] = await Promise.all([
      api.listCards(requestNotebook),
      api.listDueCards(requestNotebook).catch(() => [] as Flashcard[]),
    ]);
    if (notebookIdRef.current !== requestNotebook) return;
    setCards(all);
    setDueCards(due);
  };

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const c of cards) for (const t of c.tags) seen.add(t);
    return [...seen].sort();
  }, [cards]);

  const visibleCards = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [cards, filter]);

  const addCard = async () => {
    if (!front.trim() || !back.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCard(notebookId, {
        front: front.trim(),
        back: back.trim(),
        tags: parseCardTags(tagsInput),
      });
      setFront("");
      setBack("");
      setTagsInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add card");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (card: Flashcard) => {
    setEditingId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditTags(formatCardTags(card.tags));
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editFront.trim() || !editBack.trim()) return;
    setEditError(null);
    try {
      const updated = await api.updateCard(notebookId, editingId, {
        front: editFront.trim(),
        back: editBack.trim(),
        tags: parseCardTags(editTags),
      });
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "could not save changes");
    }
  };

  const removeCard = async (card: Flashcard) => {
    setDeleteError(null);
    try {
      await api.deleteCard(notebookId, card.id);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "could not delete card");
    }
  };

  const loadSuggestions = async () => {
    if (suggestionsBusy) return;
    setSuggestionsBusy(true);
    setSuggestionsError(null);
    try {
      const drafts = await api.listCardSuggestions(notebookId, 5);
      setSuggestions(drafts);
      setSuggestionsLoaded(true);
      setSavedDrafts(new Set());
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : "could not load drafts");
    } finally {
      setSuggestionsBusy(false);
    }
  };

  const saveDraft = async (draft: CardSuggestion) => {
    if (savingDraft) return;
    setSavingDraft(draft.front);
    setSuggestionsError(null);
    try {
      await api.createCard(notebookId, { front: draft.front, back: draft.back });
      setSavedDrafts((prev) => new Set(prev).add(draft.front));
      await refresh();
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : "could not save draft");
    } finally {
      setSavingDraft(null);
    }
  };

  const handleGraded = (updated: Flashcard) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDueCards((prev) => prev.filter((c) => c.id !== updated.id));
  };

  const startDueReview = async () => {
    try {
      const due = await api.listDueCards(notebookId);
      setDueCards(due);
      setReviewQueue(due);
    } catch {
      setReviewQueue(dueCards);
    }
  };

  const handleExportCards = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportError(null);
    try {
      await api.downloadCards(notebookId);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-pop-in">
      <Tabs
        options={[
          { value: "cards", label: "Flashcards" },
          { value: "glossary", label: "Glossary" },
          { value: "quiz", label: "Quiz" },
          { value: "guide", label: "Study guide" },
          { value: "map", label: "Mind map" },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === "cards" && (
        <>
      <Card className="p-5">
        <SectionHeader
          title="Review"
          sub="Due cards first, on a saved schedule. Grades persist — reviewed cards return when due again."
          right={
            cards.length > 0 ? (
              <button
                className="text-xs text-neutral-400 underline hover:text-neutral-100 disabled:opacity-50"
                onClick={handleExportCards}
                disabled={exportBusy}
              >
                {exportBusy ? "Exporting…" : "Export for Anki (.tsv)"}
              </button>
            ) : undefined
          }
        />
        {exportError && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            Export failed: {exportError}
          </p>
        )}
        {reviewQueue ? (
          <ReviewSession
            notebookId={notebookId}
            initialQueue={reviewQueue}
            onGraded={handleGraded}
            onExit={() => {
              setReviewQueue(null);
              void refresh().catch(() => undefined);
            }}
          />
        ) : cards.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No cards yet — add your first one below." hint="Close the source, write what you remember: that's active recall." />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={startDueReview} disabled={dueCards.length === 0}>
              Review due ({dueCards.length})
            </Button>
            <Button variant="secondary" onClick={() => setReviewQueue(shuffled(cards))}>
              Practice all ({cards.length})
            </Button>
            {dueCards.length === 0 && (
              <span className="text-xs text-neutral-500">All caught up — nothing due right now.</span>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <section aria-label="Drafts from your sources">
          <SectionHeader
            title="Drafts from your sources"
            sub="Built on this device from your notebook's own sources — not AI, and nothing is saved until you choose Save."
          />
          {!suggestionsLoaded ? (
            <div className="mt-3">
              <Button variant="secondary" onClick={loadSuggestions} disabled={suggestionsBusy}>
                {suggestionsBusy && <Spinner size={13} />}
                {suggestionsBusy ? "Looking" : "Load drafts from sources"}
              </Button>
              {suggestionsError && <p className="mt-3 text-xs text-red-400">{suggestionsError}</p>}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No drafts right now."
                hint="Add a source with readable text and try again — drafts come only from your sources."
              />
              <div className="mt-2">
                <Button variant="secondary" onClick={loadSuggestions} disabled={suggestionsBusy}>
                  Reload drafts
                </Button>
              </div>
              {suggestionsError && <p className="mt-3 text-xs text-red-400">{suggestionsError}</p>}
            </div>
          ) : (
            <div className="mt-3">
              <ul className="space-y-1.5">
                {suggestions.map((draft) => {
                  const saved = savedDrafts.has(draft.front);
                  const saving = savingDraft === draft.front;
                  return (
                    <li key={`${draft.source_id}:${draft.chunk_seq}:${draft.front}`} className="rounded-xl border border-neutral-800 px-3 py-2.5">
                      <p className="text-sm font-medium">{draft.front}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{draft.back}</p>
                      <p className="mt-1 text-[11px] text-neutral-600">
                        From “{draft.source_title}”
                        {draft.pages.length > 0 ? ` · p. ${draft.pages.join(", ")}` : ""}
                      </p>
                      <div className="mt-2">
                        <Button
                          variant="secondary"
                          onClick={() => void saveDraft(draft)}
                          disabled={saved || saving}
                        >
                          {(saving) && <Spinner size={13} />}
                          {saved ? "Saved" : saving ? "Saving…" : "Save to deck"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {suggestionsError && <p className="mt-3 text-xs text-red-400">{suggestionsError}</p>}
            </div>
          )}
        </section>
      </Card>

      <Card className="p-5">
        <SectionHeader title={`Deck (${cards.length})`} sub="Front = prompt, back = answer. Keep fronts to one question." />
        <div className="mt-3 space-y-2">
          <input className={inputCls} aria-label="Front" placeholder="Front… e.g. What splits in anaphase?" value={front} maxLength={500} onChange={(e) => setFront(e.target.value)} />
          <textarea className={`${inputCls} h-20 resize-y`} aria-label="Back" placeholder="Back… e.g. Sister chromatids separate to opposite poles." value={back} maxLength={2000} onChange={(e) => setBack(e.target.value)} />
          <input className={inputCls} aria-label="Tags (comma-separated, optional)" placeholder="Tags… e.g. bio, mitosis (optional)" value={tagsInput} maxLength={200} onChange={(e) => setTagsInput(e.target.value)} />
          <Button variant="secondary" onClick={addCard} disabled={busy || !front.trim() || !back.trim()}>
            {busy && <Spinner size={13} />}
            Add card
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        {cards.length > 0 && (
          <div className="mt-4 space-y-2">
            <input
              className={inputCls}
              aria-label="Filter cards"
              placeholder="Filter by text or tag…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
                {allTags.map((tag) => {
                  const active = filter.trim().toLowerCase() === tag.toLowerCase();
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Filter by tag ${tag}`}
                      className={`min-h-8 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-neutral-100 text-neutral-950"
                          : "bg-neutral-800 text-neutral-300 hover:text-neutral-100"
                      }`}
                      onClick={() => setFilter((f) => (f.trim().toLowerCase() === tag.toLowerCase() ? "" : tag))}
                    >
                      {tag}
                    </button>
                  );
                })}
                {filter && (
                  <button
                    type="button"
                    className="min-h-8 rounded-full px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-200"
                    onClick={() => setFilter("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {deleteError && (
              <p role="alert" className="text-xs text-red-400">
                Delete failed: {deleteError}
              </p>
            )}
            {editError && (
              <p role="alert" className="text-xs text-red-400">
                Edit failed: {editError}
              </p>
            )}
            {visibleCards.length === 0 ? (
              <p className="text-xs text-neutral-500">No cards match “{filter}”.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleCards.map((c) => (
                  <li key={c.id} className="group rounded-xl border border-neutral-800 px-3 py-2.5">
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <input className={inputCls} aria-label="Edit front" value={editFront} maxLength={500} onChange={(e) => setEditFront(e.target.value)} />
                        <textarea className={`${inputCls} h-20 resize-y`} aria-label="Edit back" value={editBack} maxLength={2000} onChange={(e) => setEditBack(e.target.value)} />
                        <input className={inputCls} aria-label="Edit tags" placeholder="Tags… comma-separated (optional)" value={editTags} maxLength={200} onChange={(e) => setEditTags(e.target.value)} />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={saveEdit}
                            disabled={!editFront.trim() || !editBack.trim()}
                          >
                            Save changes
                          </Button>
                          <Button variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.front}</p>
                          <p className="truncate text-xs text-neutral-500">{c.back}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {c.tags.map((t) => (
                              <span key={t} className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">
                                {t}
                              </span>
                            ))}
                            {c.review_count > 0 && (
                              <span className="text-[11px] text-neutral-600">
                                {c.review_count} review{c.review_count === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-3">
                          <button
                            className="text-xs text-neutral-600 hover:text-neutral-100"
                            aria-label={`Edit card: ${c.front}`}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-neutral-600 hover:text-red-400"
                            aria-label={`Delete card: ${c.front}`}
                            onClick={() => void removeCard(c)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
        </>
      )}
      {section === "glossary" && (
        <Card className="p-5 animate-pop-in">
          <SectionHeader
            title="Glossary"
            sub="Key terms drawn from your sources. Open a term's source to read it in context, or save it as a card."
          />
          <div className="mt-3">
            <GlossarySection notebookId={notebookId} onOpenSource={onOpenSource} />
          </div>
        </Card>
      )}
      {section === "quiz" && (
        <Card className="p-5 animate-pop-in">
          <SectionHeader
            title="Quiz"
            sub="Self-test from your sources. Reveal answers, keep a session score, restart any time."
          />
          <div className="mt-3">
            <QuizSection notebookId={notebookId} onOpenSource={onOpenSource} />
          </div>
        </Card>
      )}
      {section === "guide" && <GuideSection notebookId={notebookId} onSourcesChanged={onSourcesChanged} />}
      {section === "map" && <MindmapSection notebookId={notebookId} />}
    </div>
  );
}

function GuideSection({ notebookId, onSourcesChanged }: { notebookId: string; onSourcesChanged: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setMarkdown((await api.getGuide(notebookId)).markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not build guide");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 animate-pop-in">
      <SectionHeader
        title="Study guide"
        sub="A one-page guide built from your sources: key terms, per-source points, self-test prompts. No key needed."
      />
      {!markdown ? (
        <div className="mt-3">
          <Button onClick={generate} disabled={busy}>
            {busy && <ThinkingDots state="composing" />}
            {busy ? "Building" : "Build guide"}
          </Button>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{markdown}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await api.saveGuide(notebookId);
                setSaved(true);
                onSourcesChanged();
                setTimeout(() => setSaved(false), 2000);
              }}
            >
              Save as source
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(markdown).catch(() => undefined);
              }}
            >
              Copy
            </Button>
            {saved && <span className="text-xs text-emerald-400">Saved — it exports with your notebook</span>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function MindmapSection({ notebookId }: { notebookId: string }) {
  const [tree, setTree] = useState<MindmapNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setTree(null);
    setError(null);
    setExportError(null);
    api.getMindmap(notebookId)
      .then(setTree)
      .catch((err) => setError(err instanceof Error ? err.message : "could not build map"));
  }, [notebookId]);

  const handleExportMindmap = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportError(null);
    try {
      await api.downloadMindmap(notebookId);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "export failed");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <Card className="p-5 animate-pop-in">
      <SectionHeader
        title="Mind map"
        sub="Your notebook as a tree: sources branching into their key terms. No key needed."
        right={
          tree ? (
            <button
              className="text-xs text-neutral-400 underline hover:text-neutral-100 disabled:opacity-50"
              onClick={handleExportMindmap}
              disabled={exportBusy}
            >
              {exportBusy ? "Exporting…" : "Export (.md)"}
            </button>
          ) : undefined
        }
      />
      <div className="mt-3">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {exportError && (
          <p role="alert" className="text-xs text-red-400">
            Export failed: {exportError}
          </p>
        )}
        {!error && !tree && (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner /> Growing branches…
          </div>
        )}
        {tree && (
          <ul className="space-y-1.5">
            {tree.children?.map((branch) => (
              <li key={branch.name}>
                <details className="group rounded-xl border border-neutral-800 bg-neutral-900/60" open>
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium transition-colors hover:text-neutral-100 [&::-webkit-details-marker]:hidden">
                    <span className="mr-2 inline-block text-neutral-600 transition-transform group-open:rotate-90">▸</span>
                    {branch.name}
                  </summary>
                  <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                    {(branch.children ?? []).map((leaf) => (
                      <span key={leaf.name} className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300">
                        {leaf.name}
                      </span>
                    ))}
                    {(branch.children ?? []).length === 0 && (
                      <span className="text-xs text-neutral-600">no key terms found</span>
                    )}
                  </div>
                </details>
              </li>
            ))}
            {(tree.children ?? []).length === 0 && (
              <EmptyState title="Nothing to map yet." hint="Add a source and the branches grow themselves." />
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
