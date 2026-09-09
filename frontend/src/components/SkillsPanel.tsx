import { useEffect, useState } from "react";
import * as api from "../api";
import type { Skill } from "../api";
import Spinner from "./Spinner";
import { Button, Card, EmptyState, SectionHeader } from "./ui";
import { inputCls } from "./ui";

interface Props {
  notebookId: string;
}

export default function SkillsPanel({ notebookId }: Props) {
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setNotesSaved(false);
    api.getMemory(notebookId).then((m) => setNotes(m.notes)).catch(() => setNotes(""));
    api.listSkills().then(setSkills).catch(() => setSkills([]));
  }, [notebookId]);

  const saveNotes = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveMemory(notebookId, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save notes");
    } finally {
      setBusy(false);
    }
  };

  const addSkill = async () => {
    if (!name.trim() || !instructions.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSkill({
        name: name.trim(),
        instructions: instructions.trim(),
        triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setSkills((prev) => [...prev, created]);
      setName("");
      setTriggers("");
      setInstructions("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save skill");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-pop-in">
      <Card className="p-5">
        <SectionHeader
          title="Notebook memory"
          sub="Your own context for this notebook — course, exam date, what matters. It rides along with AI answers when a key is set, and stays on your machine otherwise."
        />
        <textarea
          className={`${inputCls} mt-3 h-24 resize-y`}
          placeholder="e.g. Bio 101, midterm covers chapters 1–3, prefer bullet points…"
          value={notes}
          maxLength={10000}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="secondary" onClick={saveNotes} disabled={busy}>
            {busy && <Spinner size={13} />}
            Save notes
          </Button>
          {notesSaved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Skills"
          sub="Reusable instruction bundles. When your question contains a trigger word, the skill's instructions shape the AI answer. Matching is local; skills do nothing without a key."
        />
        {skills.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No skills yet." hint="Example: Exam prep — triggers: exam, quiz — instructions: answer with flashcards." />
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {skills.map((s) => (
              <li key={s.id} className="rounded-xl border border-neutral-800 p-3">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</p>
                  <button
                    className="shrink-0 text-xs text-neutral-600 hover:text-red-400"
                    onClick={async () => {
                      await api.deleteSkill(s.id);
                      setSkills((prev) => prev.filter((x) => x.id !== s.id));
                    }}
                  >
                    delete
                  </button>
                </div>
                <p className="mt-1 text-xs text-neutral-400">{s.instructions}</p>
                {s.triggers.length > 0 && (
                  <p className="mt-1 text-[11px] text-neutral-600">triggers: {s.triggers.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
          <input className={inputCls} placeholder="Skill name… e.g. Exam prep" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="Trigger words, comma-separated… e.g. exam, quiz" value={triggers} onChange={(e) => setTriggers(e.target.value)} />
          <textarea className={`${inputCls} h-20 resize-y`} placeholder="Instructions… e.g. Answer with flashcards and end with a 3-question self-test." value={instructions} maxLength={4000} onChange={(e) => setInstructions(e.target.value)} />
          <Button variant="secondary" onClick={addSkill} disabled={busy || !name.trim() || !instructions.trim()}>
            {busy && <Spinner size={13} />}
            Add skill
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </Card>
    </div>
  );
}
