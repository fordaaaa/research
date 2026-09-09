import { useEffect, useState } from "react";
import * as api from "../api";
import type { Flashcard, MindmapNode } from "../api";
import Spinner from "./Spinner";
import { Button, Card, EmptyState, SectionHeader, Tabs } from "./ui";
import { inputCls } from "./ui";

interface Props {
  notebookId: string;
  onSourcesChanged: () => void;
}

type Section = "cards" | "guide" | "map";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function StudyPanel({ notebookId, onSourcesChanged }: Props) {
  const [section, setSection] = useState<Section>("cards");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // practice session state (local only — the deck stays the source of truth)
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [review, setReview] = useState(0);

  useEffect(() => {
    setError(null);
    setOrder([]);
    api.listCards(notebookId).then(setCards).catch(() => setCards([]));
  }, [notebookId]);

  const refresh = async () => setCards(await api.listCards(notebookId));

  const addCard = async () => {
    if (!front.trim() || !back.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCard(notebookId, { front: front.trim(), back: back.trim() });
      setFront("");
      setBack("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add card");
    } finally {
      setBusy(false);
    }
  };

  const startPractice = () => {
    setOrder(shuffled(cards));
    setIndex(0);
    setFlipped(false);
    setKnown(0);
    setReview(0);
  };

  const grade = (knew: boolean) => {
    if (knew) setKnown((k) => k + 1);
    else setReview((r) => r + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const practicing = order.length > 0 && index < order.length;
  const finished = order.length > 0 && index >= order.length;
  const current = practicing ? order[index] : null;

  return (
    <div className="space-y-5 animate-pop-in">
      <Tabs
        options={[
          { value: "cards", label: "Flashcards" },
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
          title="Practice"
          sub="Self-quiz your deck. Cards shuffle every round; your score stays in this session."
          right={cards.length > 0 ? <a className="text-xs text-neutral-400 underline hover:text-white" href={api.exportCardsUrl(notebookId)} download>Export for Anki (.tsv)</a> : undefined}
        />
        {cards.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No cards yet — add your first one below." hint="Close the source, write what you remember: that's active recall." />
          </div>
        ) : !practicing && !finished ? (
          <div className="mt-3">
            <Button onClick={startPractice}>Practice {cards.length} card{cards.length === 1 ? "" : "s"}</Button>
          </div>
        ) : practicing && current ? (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Card {index + 1} of {order.length}</span>
              <span className="text-emerald-400">{known} known</span>
              <span className="text-amber-400">{review} to review</span>
            </div>
            <button
              className="mt-2 min-h-36 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-5 text-center transition active:scale-[0.99]"
              onClick={() => setFlipped((f) => !f)}
            >
              <p className="text-[11px] uppercase tracking-wider text-neutral-600">{flipped ? "answer — tap to hide" : "question — tap to reveal"}</p>
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{flipped ? current.back : current.front}</p>
            </button>
            {flipped ? (
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => grade(false)}>Still learning</Button>
                <Button className="flex-1" onClick={() => grade(true)}>I knew it</Button>
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-neutral-600">Recall the answer out loud, then tap to check.</p>
            )}
            <div className="mt-2 text-center">
              <button className="text-xs text-neutral-600 hover:text-neutral-300" onClick={() => setOrder([])}>End session</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-neutral-800 p-4 text-center">
            <p className="text-sm font-medium">Round done: {known}/{order.length} known</p>
            <p className="mt-1 text-xs text-neutral-500">
              {known === order.length ? "Clean sweep. Space the next round a few days out." : "Re-run the round to shrink the review pile."}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button onClick={startPractice}>Practice again</Button>
              <Button variant="secondary" onClick={() => setOrder([])}>Back to deck</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader title={`Deck (${cards.length})`} sub="Front = prompt, back = answer. Keep fronts to one question." />
        <div className="mt-3 space-y-2">
          <input className={inputCls} placeholder="Front… e.g. What splits in anaphase?" value={front} maxLength={500} onChange={(e) => setFront(e.target.value)} />
          <textarea className={`${inputCls} h-20 resize-y`} placeholder="Back… e.g. Sister chromatids separate to opposite poles." value={back} maxLength={2000} onChange={(e) => setBack(e.target.value)} />
          <Button variant="secondary" onClick={addCard} disabled={busy || !front.trim() || !back.trim()}>
            {busy && <Spinner size={13} />}
            Add card
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        {cards.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {cards.map((c) => (
              <li key={c.id} className="group flex items-start gap-3 rounded-xl border border-neutral-800 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.front}</p>
                  <p className="truncate text-xs text-neutral-500">{c.back}</p>
                </div>
                <button
                  className="shrink-0 text-xs text-neutral-600 hover:text-red-400"
                  onClick={async () => {
                    await api.deleteCard(notebookId, c.id);
                    await refresh();
                  }}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
        </>
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
            {busy && <Spinner size={13} />}
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

  useEffect(() => {
    setTree(null);
    setError(null);
    api.getMindmap(notebookId)
      .then(setTree)
      .catch((err) => setError(err instanceof Error ? err.message : "could not build map"));
  }, [notebookId]);

  return (
    <Card className="p-5 animate-pop-in">
      <SectionHeader
        title="Mind map"
        sub="Your notebook as a tree: sources branching into their key terms. No key needed."
        right={tree ? <a className="text-xs text-neutral-400 underline hover:text-white" href={api.exportMindmapUrl(notebookId)} download>Export (.md)</a> : undefined}
      />
      <div className="mt-3">
        {error && <p className="text-xs text-red-400">{error}</p>}
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
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
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
