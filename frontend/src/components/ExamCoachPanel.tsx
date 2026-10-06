import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as api from "../api";
import type { CoachExplanation, CoachSession, CoachState, CoachTask, ExamGoal } from "../api";
import { playSuccess } from "../sound";
import AIActivity from "./AIActivity";
import Spinner from "./Spinner";
import { Button, Card, inputCls, Skeleton } from "./ui";

interface Props {
  notebookId: string;
  aiConfigured: boolean;
  onOpenSource: (id: string, trigger?: HTMLElement | null) => void;
  onProgress?: () => void;
}
const defaultGoal = (): ExamGoal => ({ title: "", exam_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), daily_minutes: 20, focus_topics: [] });
const nextQuestion = (session: CoachSession) => session.tasks.findIndex((task) => !session.attempts.some((attempt) => attempt.task_id === task.id));

export default function ExamCoachPanel({ notebookId, aiConfigured, onOpenSource, onProgress }: Props) {
  const [state, setState] = useState<CoachState | null>(null);
  const [loadedNotebook, setLoadedNotebook] = useState("");
  const [goal, setGoal] = useState<ExamGoal>(defaultGoal);
  const [topics, setTopics] = useState("");
  const [useAi, setUseAi] = useState(aiConfigured);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [explanation, setExplanation] = useState<CoachExplanation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const scope = useRef({ notebookId, epoch: 0 });
  const requests = useRef(new Set<AbortController>());
  const working = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  useLayoutEffect(() => {
    scope.current = { notebookId, epoch: scope.current.epoch + 1 };
    working.current = false;
    focusQuestion.current = false;
    return () => { for (const controller of requests.current) controller.abort(); requests.current.clear(); };
  }, [notebookId, reload]);
  useEffect(() => { setUseAi(aiConfigured); }, [aiConfigured]);
  useEffect(() => {
    const current = scope.current;
    const controller = new AbortController(); requests.current.add(controller);
    setState(null); setError(null); setBusy(null); setExplanation(null); setResponses({}); setRevealed(false);
    api.getCoachState(notebookId, controller.signal).then((data) => {
      if (scope.current !== current || controller.signal.aborted) return;
      setState(data); setLoadedNotebook(notebookId); setGoal(data.goal ?? defaultGoal()); setTopics(data.goal?.focus_topics.join(", ") ?? "");
      const first = data.sessions.find((item) => item.status === "active") ?? data.sessions[0];
      setSessionId(first?.id ?? null); setSelected(first?.tasks.map((task) => task.id) ?? []); setIndex(first ? Math.max(0, nextQuestion(first)) : 0);
    }).catch((reason: unknown) => {
      if (scope.current === current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your exam coach.");
    }).finally(() => requests.current.delete(controller));
    return () => controller.abort();
  }, [notebookId, reload]);
  async function run<T>(label: string, operation: (signal: AbortSignal) => Promise<T>, accept: (data: T) => void) {
    if (working.current) return;
    working.current = true;
    const current = scope.current;
    const controller = new AbortController(); requests.current.add(controller); setBusy(label); setError(null);
    try {
      const data = await operation(controller.signal);
      if (scope.current === current && !controller.signal.aborted) accept(data);
    } catch (reason) {
      if (scope.current === current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not save this change. Try again.");
    } finally {
      requests.current.delete(controller);
      if (scope.current === current) { setBusy(null); working.current = false; }
    }
  }
  function navigateQuestion(next: number) {
    focusQuestion.current = next !== index;
    setIndex(next); setRevealed(false); setExplanation(null);
  }
  function acceptSession(data: CoachSession) {
    setState((previous) => previous && ({ ...previous, sessions: [data, ...previous.sessions.filter((item) => item.id !== data.id && item.status !== "draft")] }));
    setSessionId(data.id); setSelected(data.tasks.map((task) => task.id));
    setResponses((previous) => data.id !== sessionId ? {} : Object.fromEntries(
      Object.entries(previous).filter(([key]) => !data.attempts.some((attempt) => key === `${data.id}:${attempt.task_id}`)),
    ));
    const next = nextQuestion(data);
    navigateQuestion(next < 0 && data.id === sessionId ? index : Math.max(0, next));
  }
  const session = state?.sessions.find((item) => item.id === sessionId);
  const task = session?.tasks[index];
  useLayoutEffect(() => {
    if (focusQuestion.current && questionHeading.current) {
      questionHeading.current.focus();
      focusQuestion.current = false;
    }
  }, [task?.id]);
  const attempt = session?.attempts.find((item) => item.task_id === task?.id);
  const responseKey = `${session?.id}:${task?.id}`;
  const response = responses[responseKey] ?? attempt?.response ?? "";
  const allRated = session?.tasks.every((item) => session.attempts.some((entry) => entry.task_id === item.id));
  const hasActive = state?.sessions.some((item) => item.status === "active");
  const aiEnabled = useAi && aiConfigured;
  const draftGoal = { ...goal, title: goal.title.trim(), focus_topics: [...new Set(topics.split(",").map((topic) => topic.trim()).filter(Boolean))] };
  const goalDirty = JSON.stringify(draftGoal) !== JSON.stringify(state?.goal);
  const selectedMinutes = session?.tasks.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.minutes, 0) ?? 0;
  function citation(item: CoachTask) {
    return item.source_id && <button type="button" className="text-left text-sm text-indigo-300 underline underline-offset-4" onClick={(event) => onOpenSource(item.source_id!, event.currentTarget)}>
      {item.source_title ?? "Course source"}{item.pages.length > 0 ? ` · p. ${item.pages.join(", ")}` : ""}
    </button>;
  }
  const notice = error && <div role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}<Button variant="ghost" onClick={() => setReload((value) => value + 1)} disabled={!!busy}>Reload coach</Button></div>;
  if (!state || loadedNotebook !== notebookId) return <div className="space-y-4">{notice}<Skeleton className="h-40 w-full" /><p className="text-sm text-neutral-500">Loading your revision plan…</p></div>;
  return <div className="mx-auto w-full max-w-3xl space-y-5 pb-8">
    <div><h2 className="text-xl font-semibold text-neutral-100">Your exam coach</h2><p className="mt-1 text-sm text-neutral-400">Know what to study next. Use your course material, practise, and revisit what you missed.</p></div>
    {notice}
    <Card className="space-y-4">
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const value = { ...goal, focus_topics: topics.split(",").map((topic) => topic.trim()).filter(Boolean) };
        void run("save", (signal) => api.saveExamGoal(notebookId, value, signal), (saved) => { setGoal(saved); setTopics(saved.focus_topics.join(", ")); setState((previous) => previous && ({ ...previous, goal: saved })); });
      }}>
        <label className="block text-sm text-neutral-300">Exam title<input className={`${inputCls} mt-1 w-full`} value={goal.title} maxLength={120} required onChange={(event) => setGoal({ ...goal, title: event.target.value })} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm text-neutral-300">Exam date<input type="date" required className={`${inputCls} mt-1 w-full min-w-0`} value={goal.exam_date} onChange={(event) => setGoal({ ...goal, exam_date: event.target.value })} /></label>
          <label className="block text-sm text-neutral-300">Study minutes per session<input type="number" min={5} max={120} required className={`${inputCls} mt-1 w-full`} value={goal.daily_minutes} onChange={(event) => setGoal({ ...goal, daily_minutes: Number(event.target.value) })} /></label>
        </div>
        <label className="block text-sm text-neutral-300">Focus topics (optional)<input className={`${inputCls} mt-1 w-full`} value={topics} placeholder="Photosynthesis, cell respiration" onChange={(event) => setTopics(event.target.value)} /></label>
        <Button type="submit" disabled={!!busy || !goal.title.trim()}>Save exam goal</Button>
        {state.goal && <p className="text-xs text-neutral-500">Saved: {state.goal.title} · {state.goal.daily_minutes} minutes · {state.goal.exam_date}. Save edits before building your next session.</p>}
      </form>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-3">
        <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={useAi && aiConfigured} disabled={!aiConfigured || !!busy} onChange={(event) => setUseAi(event.target.checked)} />Use AI for practice</label>
        {!aiConfigured && <p className="text-xs text-neutral-500">Source-based practice works now. Add an optional AI key in Settings for explanations.</p>}
        <Button disabled={!state.goal || goalDirty || !!busy || hasActive} onClick={() => void run(aiEnabled ? "ai-plan" : "plan", (signal) => api.buildCoachSession(notebookId, aiEnabled, signal), acceptSession)}>Build revision session</Button>
      </div>
      {hasActive && <p className="text-sm text-neutral-400">Finish your active session before building another.{session?.status !== "active" && <Button variant="ghost" disabled={!!busy} onClick={() => { setSessionId(state.sessions.find((item) => item.status === "active")!.id); navigateQuestion(0); }}>Resume active session</Button>}</p>}
    </Card>
    {busy?.startsWith("ai-") ? <AIActivity /> : busy && <div role="status" className="flex items-center gap-2 text-sm text-neutral-400"><Spinner />Saving your revision progress…</div>}
    {session && <Card className="space-y-4">
      <div><h3 className="text-lg font-semibold text-neutral-100">{session.status === "completed" ? "Session complete" : session.status === "draft" ? "Your revision session" : "Practice session"}</h3><p className="mt-1 text-sm text-neutral-400">{session.goal.title} · {session.tasks.reduce((sum, item) => sum + item.minutes, 0)} minutes · {session.generated_by === "ai" ? "AI practice" : "Source-based practice"}</p></div>
      {session.notice && <p role="status" className="text-sm text-amber-200">{session.notice}</p>}
      {session.status === "draft" && <>
        <p className="text-sm text-neutral-400">Choose your questions and their order before starting.</p>
        <ol className="space-y-3">{selected.concat(session.tasks.filter((item) => !selected.includes(item.id)).map((item) => item.id)).map((id) => {
          const item = session.tasks.find((entry) => entry.id === id)!; const position = selected.indexOf(id);
          return <li key={id} className="rounded-xl border border-neutral-800 p-3">
            <label className="flex items-start gap-2 text-sm font-medium text-neutral-200"><input type="checkbox" aria-label={`Include ${item.topic}`} disabled={!!busy} checked={position >= 0} onChange={(event) => setSelected(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))} />{item.topic} · {item.minutes} min</label>
            <p className="mt-2 text-sm text-neutral-400">{item.prompt}</p><p className="mt-1 text-xs text-neutral-500">{item.reason}</p>{citation(item)}
            {position >= 0 && <div className="mt-2 flex gap-2">{[-1, 1].map((direction) => <Button key={direction} variant="ghost" disabled={!!busy || position + direction < 0 || position + direction >= selected.length} aria-label={`Move ${item.topic} ${direction < 0 ? "up" : "down"}`} onClick={() => setSelected((previous) => { const next = [...previous]; [next[position], next[position + direction]] = [next[position + direction], next[position]]; return next; })}>{direction < 0 ? "Move up" : "Move down"}</Button>)}</div>}
          </li>;
        })}</ol>
        <p className="text-sm text-neutral-400">Selected: {selectedMinutes} of {session.goal.daily_minutes} minutes</p>
        <Button disabled={!!busy || !selected.length || selectedMinutes > session.goal.daily_minutes} onClick={() => void run("start", (signal) => api.startCoachSession(notebookId, session.id, selected, signal), acceptSession)}>Start selected session</Button>
      </>}
      {session.status === "active" && task && <div className="animate-phase-in space-y-3" key={task.id}>
        <p className="text-xs text-neutral-500">Question {index + 1} of {session.tasks.length} · {session.attempts.length} answered</p>
        <h4 ref={questionHeading} tabIndex={-1} className="font-medium text-neutral-200 outline-none">{task.topic}</h4><p className="text-sm text-neutral-300">{task.prompt}</p><p className="text-xs text-neutral-500">{task.reason}</p>
        <label className="block text-sm text-neutral-300">Your answer<textarea maxLength={4000} rows={4} className={`${inputCls} mt-1 w-full`} value={response} disabled={!!busy} onChange={(event) => { const value = event.target.value; setResponses((previous) => ({ ...previous, [responseKey]: value })); }} /></label>
        <p className="text-xs text-neutral-500">Choose Got it or Revise again to save your answer. Unrated drafts stay here while you move between questions.</p>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!!busy} onClick={() => setRevealed(true)}>Show reference answer</Button><Button variant="ghost" disabled={!!busy} onClick={() => void run(aiEnabled ? "ai-explanation" : "explanation", (signal) => api.explainCoachTask(notebookId, session.id, task.id, aiEnabled, signal), setExplanation)}>{aiEnabled ? "Explain with AI" : "Show explanation"}</Button></div>
        {revealed && <div className="animate-phase-in rounded-xl bg-neutral-950 p-3"><p className="whitespace-pre-wrap text-sm text-neutral-200">{task.answer}</p>{citation(task)}<p className="mt-2 text-xs text-neutral-500">Compare your answer, then choose how to revise. These ratings are your self-assessment.</p></div>}
        {explanation && <div className="animate-phase-in space-y-2 rounded-xl bg-neutral-950 p-3"><p className="whitespace-pre-wrap text-sm text-neutral-200">{explanation.answer}</p>{explanation.notice && <p className="text-sm text-amber-200">{explanation.notice}</p>}{explanation.citations.map((entry) => <button type="button" key={entry.source_id} className="block text-sm text-indigo-300 underline" onClick={(event) => onOpenSource(entry.source_id, event.currentTarget)}>{entry.source_title} · p. {entry.pages.join(", ")}</button>)}</div>}
        {(revealed || explanation || attempt) && <div className="flex flex-wrap gap-2">{(["got_it", "revise"] as const).map((rating) => <Button key={rating} disabled={!!busy} onClick={() => void run("attempt", (signal) => api.recordCoachAttempt(notebookId, session.id, { task_id: task.id, rating, response }, signal), acceptSession)}>{rating === "got_it" ? "Got it" : "Revise again"}</Button>)}</div>}
        <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!!busy || index === 0} onClick={() => navigateQuestion(index - 1)}>Previous question</Button><Button variant="ghost" disabled={!!busy || index === session.tasks.length - 1} onClick={() => navigateQuestion(index + 1)}>Next question</Button>{allRated && <Button disabled={!!busy} onClick={() => void run("finish", (signal) => api.finishCoachSession(notebookId, session.id, signal), (data) => { acceptSession(data); playSuccess(); onProgress?.(); })}>Finish session</Button>}</div>
      </div>}
      {session.status === "completed" && <>
        <p className="text-sm text-neutral-300">{session.attempts.filter((item) => item.rating === "revise").length} topic{session.attempts.filter((item) => item.rating === "revise").length === 1 ? "" : "s"} to revisit in your next session.</p>
        <p className="text-xs text-neutral-500">Your ratings guide the next plan. They do not estimate your exam score.</p>
        <ul className="space-y-3">{session.tasks.map((item) => { const saved = session.attempts.find((entry) => entry.task_id === item.id); return <li key={item.id} className="rounded-xl border border-neutral-800 p-3"><h4 className="text-sm font-medium text-neutral-200">{item.topic} · {saved?.rating === "revise" ? "Revisit" : "Got it"}</h4><p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{saved?.response || "No written answer"}</p><details className="mt-2 text-sm text-neutral-400"><summary>Reference answer</summary><p className="mt-2 whitespace-pre-wrap">{item.answer}</p>{citation(item)}</details></li>; })}</ul>
      </>}
    </Card>}
    {state.sessions.some((item) => item.status === "completed") && <Card><h3 className="mb-3 font-medium text-neutral-200">Saved sessions</h3><div className="flex flex-wrap gap-2">{state.sessions.filter((item) => item.status === "completed").map((item) => <Button key={item.id} variant="ghost" disabled={!!busy} aria-pressed={item.id === sessionId} onClick={() => { setSessionId(item.id); navigateQuestion(0); }}>{item.goal.title} · {new Date(item.created_at).toLocaleDateString()} · {item.attempts.length} answers</Button>)}</div></Card>}
  </div>;
}
