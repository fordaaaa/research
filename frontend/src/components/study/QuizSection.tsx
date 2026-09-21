import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as api from "../../api";
import Spinner from "../Spinner";
import { Button, EmptyState } from "../ui";

interface Props {
  notebookId: string;
  onOpenSource?: (sourceId: string) => void;
}

function pagesLabel(pages: number[]): string {
  return pages.length > 0 ? ` · p. ${pages.join(", ")}` : "";
}

export default function QuizSection({ notebookId, onOpenSource }: Props) {
  const [prompts, setPrompts] = useState<api.QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const requestRef = useRef(0);
  const notebookIdRef = useRef(notebookId);
  useLayoutEffect(() => {
    notebookIdRef.current = notebookId;
  }, [notebookId]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestRef.current;
    setPrompts(null);
    setError(null);
    setIndex(0);
    setRevealed(false);
    setAnswered(0);
    setCorrect(0);
    api
      .listQuiz(notebookId, 10)
      .then((result) => {
        if (!cancelled && requestRef.current === requestId) setPrompts(result);
      })
      .catch((err) => {
        if (!cancelled && requestRef.current === requestId)
          setError(err instanceof Error ? err.message : "could not load quiz");
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const reload = () => {
    const requestId = ++requestRef.current;
    const requestNotebook = notebookId;
    setPrompts(null);
    setError(null);
    setIndex(0);
    setRevealed(false);
    setAnswered(0);
    setCorrect(0);
    api
      .listQuiz(notebookId, 10)
      .then((result) => {
        if (requestRef.current !== requestId || notebookIdRef.current !== requestNotebook) return;
        setPrompts(result);
      })
      .catch((err) => {
        if (requestRef.current !== requestId || notebookIdRef.current !== requestNotebook) return;
        setError(err instanceof Error ? err.message : "could not load quiz");
      });
  };

  const restart = () => {
    setIndex(0);
    setRevealed(false);
    setAnswered(0);
    setCorrect(0);
  };

  const grade = (knew: boolean) => {
    setAnswered((n) => n + 1);
    if (knew) setCorrect((n) => n + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const total = prompts?.length ?? 0;
  const current = prompts && index < prompts.length ? prompts[index] : null;
  const finished = prompts !== null && prompts.length > 0 && index >= prompts.length;

  return (
    <section aria-label="Quiz">
      <p className="text-xs leading-relaxed text-neutral-500">
        Built locally and deterministically from your sources. No AI, no key needed — results stay in
        this session and are never sent back.
      </p>
      {prompts === null && !error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Loading quiz…
        </div>
      )}
      {error && (
        <div className="mt-3">
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
          {/no source/i.test(error) && (
            <p className="mt-1 text-xs text-neutral-500">
              Add a source with readable text first — quiz questions come only from your sources.
            </p>
          )}
          <div className="mt-2">
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        </div>
      )}
      {prompts !== null && !error && prompts.length === 0 && (
        <div className="mt-3">
          <EmptyState
            title="No questions right now."
            hint="Add a source with readable text and reload — questions come only from your sources."
          />
          <div className="mt-2">
            <Button variant="secondary" onClick={reload}>
              Reload
            </Button>
          </div>
        </div>
      )}
      {prompts !== null && !error && prompts.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
            <span aria-live="polite">
              {finished ? `Done: ${total} of ${total}` : `Question ${index + 1} of ${total}`}
            </span>
            <span aria-live="polite">
              Score: {correct} correct of {answered} answered
            </span>
          </div>
          {finished || !current ? (
            <div className="mt-2 rounded-xl border border-neutral-800 p-4 text-center">
              <p className="text-sm font-medium">
                Session done: {correct}/{total} correct
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Re-run to shrink the miss pile. Nothing was saved — this score lives only here.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button onClick={restart}>Restart</Button>
                <Button variant="secondary" onClick={reload}>
                  New questions
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-neutral-800 px-3 py-3.5">
              <p className="text-[11px] uppercase tracking-wider text-neutral-600">
                {current.question_type === "cloze" ? "fill in the blank" : "short answer"} · {current.term}
              </p>
              <p className="mt-1.5 text-base leading-relaxed">{current.prompt}</p>
              {revealed && (
                <p className="mt-2 rounded-lg bg-neutral-950 px-3 py-2 text-sm text-emerald-300">
                  {current.answer}
                </p>
              )}
              <p className="mt-2 text-[11px] text-neutral-600">
                From “{current.source_title}”{pagesLabel(current.pages)}
              </p>
              {!revealed ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => setRevealed(true)}>Show answer</Button>
                  {onOpenSource && (
                    <Button variant="ghost" onClick={() => onOpenSource(current.source_id)}>
                      Open source
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Grade this answer">
                  <Button onClick={() => grade(true)}>Mark correct</Button>
                  <Button variant="secondary" onClick={() => grade(false)}>
                    Mark missed
                  </Button>
                  {onOpenSource && (
                    <Button variant="ghost" onClick={() => onOpenSource(current.source_id)}>
                      Open source
                    </Button>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="min-h-11 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-300"
                  onClick={restart}
                >
                  Restart
                </button>
                <span className="text-[11px] text-neutral-600">
                  Tab to an action, Enter to run it.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
