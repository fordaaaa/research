import { useState } from "react";
import type { Notebook } from "../api";

interface Props {
  notebooks: Notebook[];
  onOpen: (nb: Notebook) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function NotebookPicker({ notebooks, onOpen, onCreate, onDelete }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex-1 overflow-y-auto p-8 animate-page-in">
      <div className="max-w-xl mx-auto space-y-6">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            try {
              await onCreate(name.trim());
              setName("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm outline-none focus:border-neutral-600"
            placeholder="New notebook name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="rounded-lg bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            Create
          </button>
        </form>
        <ul className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden">
          {notebooks.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-neutral-500">
              No notebooks yet — create one above.
            </li>
          )}
          {notebooks.map((nb, i) => (
            <li key={nb.id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-900 transition-colors animate-card-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <button className="flex-1 text-left min-w-0" onClick={() => onOpen(nb)}>
                <span className="text-sm font-medium">{nb.name}</span>
                <span className="ml-3 text-xs text-neutral-500">
                  {new Date(nb.created_at).toLocaleDateString()}
                </span>
              </button>
              <button
                className="text-xs text-neutral-500 hover:text-red-400"
                onClick={() => onDelete(nb.id)}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
