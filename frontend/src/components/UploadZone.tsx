import { useRef, useState } from "react";
import type { UploadError } from "../api";

interface Props {
  onUpload: (files: File[]) => Promise<UploadError[]>;
  onPaste: (title: string, text: string) => Promise<void>;
}

export default function UploadZone({ onUpload, onPaste }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      setErrors(await onUpload(Array.from(files)));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-dashed border-neutral-700 hover:border-neutral-500 transition-colors p-6 text-center cursor-pointer"
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-sm font-medium">{busy ? "Uploading…" : "Drop files or click to upload"}</p>
        <p className="text-xs text-neutral-500 mt-1">PDF · DOCX · TXT · MD — up to 50 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <button
        type="button"
        className="text-xs text-neutral-400 hover:text-neutral-200 underline"
        onClick={() => setShowPaste(!showPaste)}
      >
        {showPaste ? "Hide paste" : "Paste text instead"}
      </button>

      {showPaste && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            try {
              await onPaste(title.trim() || "Pasted note", text);
              setText("");
              setTitle("");
              setShowPaste(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full h-28 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600"
            placeholder="Paste your text here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="rounded-lg bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            Save source
          </button>
        </form>
      )}

      {errors.map((err) => (
        <p key={err.file} className="text-xs text-red-400">
          {err.file}: {err.detail}
        </p>
      ))}
    </div>
  );
}
