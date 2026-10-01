import { useMemo, useState } from "react";
import type { Assignment, CalendarDay, StudyClass } from "../api";
import { Badge, Button, inputCls } from "./ui";
import { playTap } from "../sound";

/**
 * Month calendar for the dashboard. Data comes from the dashboard's 35-day
 * horizon: days outside it render dimmed with no dots (previous months are
 * history; further-out months have nothing scheduled yet).
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLASS_COLORS: Record<string, string> = {
  sea: "bg-aqua",
  ocean: "bg-brand-deep",
  aqua: "bg-aquabright",
  wave: "bg-wave",
  mark: "bg-mark",
  plum: "bg-purple-500",
};

export const CLASS_COLOR_CHOICES = Object.keys(CLASS_COLORS);

export function classColorDot(color: string): string {
  return CLASS_COLORS[color] ?? CLASS_COLORS.sea;
}

interface Props {
  days: CalendarDay[];
  today: string;
  classes: StudyClass[];
  onCreateAssignment: (input: { title: string; dueDay: string; classId: string | null }) => Promise<void>;
  onToggleAssignment: (assignment: Assignment) => Promise<void>;
}

interface MonthCell {
  day: string | null; // null = leading/trailing filler
  inHorizon: boolean;
  data: CalendarDay | null;
}

export default function CalendarMonth({
  days, today, classes, onCreateAssignment, onToggleAssignment,
}: Props) {
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of days) map.set(day.day, day);
    return map;
  }, [days]);

  const [viewMonth, setViewMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftClass, setDraftClass] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const cells = useMemo<MonthCell[]>(() => {
    const [year, month] = viewMonth.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startOffset = first.getUTCDay(); // Sunday-first grid
    const monthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const result: MonthCell[] = [];
    for (let i = 0; i < startOffset; i += 1) {
      result.push({ day: null, inHorizon: false, data: null });
    }
    for (let d = 1; d <= monthLength; d += 1) {
      const day = `${viewMonth}-${String(d).padStart(2, "0")}`;
      result.push({
        day,
        inHorizon: byDay.has(day),
        data: byDay.get(day) ?? null,
      });
    }
    return result;
  }, [viewMonth, byDay]);

  const monthLabel = useMemo(() => {
    const [year, month] = viewMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }, [viewMonth]);

  const shiftMonth = (delta: number) => {
    const [year, month] = viewMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setViewMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
    playTap();
  };

  const selected = byDay.get(selectedDay) ?? null;
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const submitDraft = async () => {
    const title = draftTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await onCreateAssignment({
        title,
        dueDay: selectedDay,
        classId: draftClass || null,
      });
      setDraftTitle("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{monthLabel}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</Button>
          <Button variant="ghost" aria-label="Next month" onClick={() => shiftMonth(1)}>→</Button>
        </div>
      </div>

      <div role="grid" aria-label="Calendar" className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} aria-hidden="true" className="pb-1 font-semibold uppercase tracking-wide text-neutral-500">
            {weekday}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell.day) {
            return <div key={`pad-${index}`} aria-hidden="true" />;
          }
          const isToday = cell.day === today;
          const isSelected = cell.day === selectedDay;
          const assignmentDots = (cell.data?.assignments ?? []).slice(0, 3);
          const dueCount = (cell.data?.card_due ?? []).reduce((sum, entry) => sum + entry.count, 0);
          const day = cell.day;
          return (
            <button
              key={day}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${day}${dueCount ? `, ${dueCount} cards due` : ""}${
                assignmentDots.length ? `, ${cell.data?.assignments.length} assignments` : ""
              }`}
              onClick={() => { setSelectedDay(day); playTap(); }}
              className={`relative aspect-square rounded-xl border p-1 text-xs transition-colors ${
                isSelected
                  ? "border-aqua bg-seafoam/60 dark:border-aqua"
                  : "border-neutral-800 hover:border-aqua/40"
              } ${cell.inHorizon ? "" : "opacity-40"}`}
            >
              <span className={isToday ? "font-bold text-aquabright" : ""}>
                {Number(day.slice(8))}
              </span>
              <span className="absolute inset-x-1 bottom-1 flex flex-wrap items-center justify-center gap-0.5">
                {assignmentDots.map((assignment) => (
                  <span
                    key={assignment.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      assignment.done ? "bg-neutral-600" : classColorDot(
                        classById.get(assignment.class_id ?? "")?.color ?? "",
                      )
                    }`}
                  />
                ))}
                {dueCount > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            {selectedDay === today ? "Today" : selectedDay}
          </p>
          {selected && selected.card_due.length > 0 && (
            <Badge>
              {selected.card_due.reduce((sum, entry) => sum + entry.count, 0)} cards due
            </Badge>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {(selected?.assignments ?? []).map((assignment) => (
            <li key={assignment.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignment.done}
                onChange={() => onToggleAssignment(assignment)}
                aria-label={`Mark ${assignment.title} ${assignment.done ? "not done" : "done"}`}
                className="h-4 w-4 accent-aqua"
              />
              <span className={`flex-1 ${assignment.done ? "text-neutral-500 line-through" : ""}`}>
                {assignment.title}
                {assignment.class_name && (
                  <span className="ml-2 text-xs text-neutral-500">{assignment.class_name}</span>
                )}
              </span>
              {assignment.source === "google_classroom" && <Badge>Classroom</Badge>}
            </li>
          ))}
          {selected && selected.assignments.length === 0 && (
            <li className="text-xs text-neutral-500">Nothing scheduled for this day yet.</li>
          )}
        </ul>

        <div className="mt-3 flex gap-2">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void submitDraft(); }}
            placeholder={`Add due item on ${selectedDay === today ? "today" : selectedDay}…`}
            aria-label="New assignment title"
            className={`${inputCls} flex-1`}
          />
          {classes.length > 0 && (
            <select
              value={draftClass}
              onChange={(event) => setDraftClass(event.target.value)}
              aria-label="Class"
              className={`${inputCls} w-auto`}
            >
              <option value="">No class</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>{klass.name}</option>
              ))}
            </select>
          )}
          <Button onClick={() => void submitDraft()} disabled={!draftTitle.trim() || saving}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
