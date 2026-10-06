import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import type { Assignment, DashboardSummary, QueuedCard, StudyClass } from "../api";
import NotebookPicker from "./NotebookPicker";
import CalendarMonth, { CLASS_COLOR_CHOICES, classColorDot } from "./CalendarMonth";
import { Badge, Button, Card, Skeleton, inputCls } from "./ui";
import { playSuccess } from "../sound";

/**
 * The home surface: today's study pulse (streak, due cards, calendar,
 * classes) above the notebook library. Replaces the old file-picker-first
 * home; the library is a section, not the whole page.
 */

interface Props {
  notebooks: api.Notebook[];
  userId: string;
  userName: string;
  refreshToken: number;
  tourPending?: boolean;
  tourActive?: boolean;
  sourcesCount?: number;
  hasSearched?: boolean;
  hasExportedOrReviewed?: boolean;
  onOpen: (nb: api.Notebook) => void;
  onOpenCoach?: (nb: api.Notebook) => void;
  onCreate: (name: string) => Promise<api.Notebook>;
  onDelete: (id: string) => Promise<void>;
  onStartReview: (queue: QueuedCard[], notebookNames: Record<string, string>) => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeDashboard({
  notebooks, userId, userName, refreshToken, tourPending = false, tourActive = false,
  sourcesCount = 0, hasSearched = false, hasExportedOrReviewed = false,
  onOpen, onOpenCoach, onCreate, onDelete, onStartReview,
}: Props) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [classDraft, setClassDraft] = useState("");
  const [classColor, setClassColor] = useState(CLASS_COLOR_CHOICES[0]);
  const [classroom, setClassroom] = useState<api.ClassroomStatus | null>(null);
  const [classroomBusy, setClassroomBusy] = useState(false);
  const [classroomNote, setClassroomNote] = useState<string | null>(null);
  const [coachNotebookId, setCoachNotebookId] = useState("");
  const coachNotebook = notebooks.find((item) => item.id === coachNotebookId) ?? notebooks[0];

  const load = useCallback(async () => {
    try {
      setSummary(await api.getDashboard());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "could not load dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    api.getClassroomStatus().then(setClassroom).catch(() => setClassroom(null));
  }, [refreshToken]);

  const startReview = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const queue = await api.getUserReviewQueue();
      if (queue.length === 0) {
        playSuccess();
        return;
      }
      const names: Record<string, string> = {};
      for (const item of queue) names[item.card.id] = item.notebook_name;
      onStartReview(queue, names);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "could not start review");
    } finally {
      setStarting(false);
    }
  };

  const addClass = async () => {
    const name = classDraft.trim();
    if (!name) return;
    const klass = await api.createClass(name, classColor);
    setClassDraft("");
    setSummary((s) => (s ? { ...s, classes: [...s.classes, klass] } : s));
  };

  const removeClass = async (id: string) => {
    await api.deleteClass(id);
    setSummary((s) =>
      s ? { ...s, classes: s.classes.filter((c) => c.id !== id) } : s,
    );
    void load();
  };

  const createAssignment = async (input: {
    title: string;
    dueDay: string;
    classId: string | null;
  }) => {
    const created = await api.createAssignment({
      title: input.title,
      class_id: input.classId,
      due_at: `${input.dueDay}T23:59:00Z`,
    });
    setSummary((s) => {
      if (!s) return s;
      const day = s.calendar.find((d) => d.day === input.dueDay);
      if (day) day.assignments.push(created);
      return { ...s };
    });
  };

  const toggleAssignment = async (assignment: Assignment) => {
    const updated = await api.updateAssignment(assignment.id, { done: !assignment.done });
    setSummary((s) => {
      if (!s) return s;
      const day = s.calendar.find((d) => d.day === (updated.due_at ?? "").slice(0, 10));
      if (day) {
        day.assignments = day.assignments.map((a) => (a.id === updated.id ? updated : a));
      }
      return { ...s };
    });
  };

  const connectClassroom = async () => {
    setClassroomBusy(true);
    setClassroomNote(null);
    try {
      const { authorize_url } = await api.getClassroomAuthorizeUrl();
      window.location.href = authorize_url;
    } catch (err) {
      setClassroomNote(err instanceof Error ? err.message : "could not start connection");
      setClassroomBusy(false);
    }
  };

  const syncNow = async () => {
    setClassroomBusy(true);
    setClassroomNote(null);
    try {
      const result = await api.syncClassroom();
      setClassroomNote(
        `Synced ${result.classes_synced} classes, ${result.assignments_synced} new assignments.`,
      );
      const status = await api.getClassroomStatus();
      setClassroom(status);
      void load();
    } catch (err) {
      setClassroomNote(err instanceof Error ? err.message : "sync failed");
    } finally {
      setClassroomBusy(false);
    }
  };

  const disconnect = async () => {
    setClassroomBusy(true);
    try {
      await api.disconnectClassroom();
      setClassroom(await api.getClassroomStatus());
      setClassroomNote("Disconnected from Google Classroom.");
      void load();
    } finally {
      setClassroomBusy(false);
    }
  };

  const due = summary?.due_total ?? 0;
  const streak = summary?.streak;

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none animate-page-in">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-10 sm:py-12">
        {onOpenCoach && (
          <section aria-label="Exam coach" className="rounded-[2rem] border border-neutral-800 bg-neutral-900 p-5 shadow-[0_8px_35px_rgba(6,48,62,0.05)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-wave">Your exam coach</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">Know what to study next.</h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-500">Set an exam goal, practise from your course material, and revisit the topics that need another pass.</p>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium sm:max-w-sm">
                Exam course notebook
                <select aria-label="Exam course notebook" value={coachNotebook?.id ?? ""}
                  onChange={(event) => setCoachNotebookId(event.target.value)} className={inputCls} disabled={!coachNotebook}>
                  {!coachNotebook && <option value="">Choose a course notebook</option>}
                  {notebooks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <Button variant="primary" disabled={!coachNotebook}
                onClick={() => { if (coachNotebook) onOpenCoach(coachNotebook); }}>Plan exam revision</Button>
            </div>
            {!coachNotebook && <p className="mt-3 text-xs text-neutral-500">Create a course notebook below to start.</p>}
          </section>
        )}
        <section aria-label="Today" className="relative overflow-hidden rounded-[2rem] bg-brand-deep px-5 py-7 text-mark shadow-[0_25px_70px_rgba(6,48,62,0.14)] sm:px-10">
          <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border border-mark/15" aria-hidden="true" />
          <div className="pointer-events-none absolute right-8 top-8 h-52 w-52 rounded-full bg-aqua/30 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aquabright">
                {greeting()}, {userName}
              </p>
              <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                {due > 0 ? `${due} card${due === 1 ? "" : "s"} due today` : "All caught up. 🎉"}
              </h1>
              <p className="mt-2 flex items-center gap-3 text-sm text-mark/80">
                <span>
                  🔥 {streak ? streak.current : "…"}-day streak
                  {streak?.longest ? ` · best ${streak.longest}` : ""}
                </span>
                {streak?.reviewed_today && <Badge>reviewed today</Badge>}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => void startReview()}
              disabled={starting}
              className="min-w-40"
              aria-label={due > 0 ? `Start reviewing ${due} due cards` : "Check for due cards"}
            >
              {due > 0 ? "Start review" : "Check for reviews"}
            </Button>
          </div>
        </section>

        {loadError && (
          <p role="alert" className="rounded-xl border border-mark/30 bg-mark/10 p-3 text-sm">
            {loadError}
          </p>
        )}

        {!summary ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Skeleton lines={6} />
            <Skeleton lines={8} />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card className="p-5">
              <CalendarMonth
                days={summary.calendar}
                today={summary.calendar[0]?.day ?? new Date().toISOString().slice(0, 10)}
                classes={summary.classes}
                onCreateAssignment={createAssignment}
                onToggleAssignment={toggleAssignment}
              />
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <h3 className="font-display text-lg font-semibold">Classes</h3>
                <ul className="mt-3 space-y-2">
                  {summary.classes.map((klass: StudyClass) => (
                    <li key={klass.id} className="flex items-center gap-2 text-sm">
                      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${classColorDot(klass.color)}`} />
                      <span className="flex-1">{klass.name}</span>
                      {klass.source === "google_classroom" && <Badge>Classroom</Badge>}
                      <button
                        onClick={() => void removeClass(klass.id)}
                        className="text-xs text-neutral-500 hover:text-mark"
                        aria-label={`Remove class ${klass.name}`}
                      >
                        remove
                      </button>
                    </li>
                  ))}
                  {summary.classes.length === 0 && (
                    <li className="text-xs text-neutral-500">
                      No classes yet — add one, or connect Google Classroom below.
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    value={classDraft}
                    onChange={(event) => setClassDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void addClass(); }}
                    placeholder="Add a class…"
                    aria-label="New class name"
                    className={`${inputCls} flex-1`}
                  />
                  <select
                    value={classColor}
                    onChange={(event) => setClassColor(event.target.value)}
                    aria-label="Class color"
                    className={`${inputCls} w-auto`}
                  >
                    {CLASS_COLOR_CHOICES.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                  <Button onClick={() => void addClass()} disabled={!classDraft.trim()}>
                    Add
                  </Button>
                </div>
              </Card>

              {classroom?.enabled && (
                <Card className="p-5">
                  <h3 className="font-display text-lg font-semibold">Google Classroom</h3>
                  <div className="mt-3 space-y-3 text-sm">
                    {classroom.connected ? (
                      <>
                        <p className="text-neutral-500">
                          Connected{classroom.last_sync_at ? ` · last synced ${new Date(classroom.last_sync_at).toLocaleString()}` : " · never synced"}
                        </p>
                        <div className="flex gap-2">
                          <Button onClick={() => void syncNow()} disabled={classroomBusy}>
                            Sync now
                          </Button>
                          <Button variant="ghost" onClick={() => void disconnect()} disabled={classroomBusy}>
                            Disconnect
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-neutral-500">
                          Pull your courses and due dates so they appear on the calendar.
                        </p>
                        <Button onClick={() => void connectClassroom()} disabled={classroomBusy}>
                          Connect Google Classroom
                        </Button>
                      </>
                    )}
                    {classroomNote && <p className="text-xs text-aquabright">{classroomNote}</p>}
                  </div>
                </Card>
              )}

              {(summary.recent_notes.length > 0 || summary.recent_sources.length > 0) && (
                <Card className="p-5">
                  <h3 className="font-display text-lg font-semibold">Recent</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {summary.recent_sources.map((source) => (
                      <li key={`s-${source.id}`}>
                        <button
                          className="text-left hover:text-aquabright"
                          onClick={() => {
                            const nb = notebooks.find((n) => n.id === source.notebook_id);
                            if (nb) onOpen(nb);
                          }}
                        >
                          <span aria-hidden="true">📄</span> {source.title}
                          <span className="ml-2 text-xs text-neutral-500">{source.notebook_name}</span>
                        </button>
                      </li>
                    ))}
                    {summary.recent_notes.map((note) => (
                      <li key={`n-${note.id}`}>
                        <button
                          className="text-left hover:text-aquabright"
                          onClick={() => {
                            const nb = notebooks.find((n) => n.id === note.notebook_id);
                            if (nb) onOpen(nb);
                          }}
                        >
                          <span aria-hidden="true">📝</span> {note.title}
                          <span className="ml-2 text-xs text-neutral-500">{note.notebook_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        )}

        <NotebookPicker
          variant="library"
          notebooks={notebooks}
          tourPending={tourPending}
          tourActive={tourActive}
          userId={userId}
          sourcesCount={sourcesCount}
          hasSearched={hasSearched}
          hasExportedOrReviewed={hasExportedOrReviewed}
          onOpen={onOpen}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      </div>
    </main>
  );
}
