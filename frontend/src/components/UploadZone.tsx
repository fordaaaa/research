import { useRef, useState } from "react";
import type { UploadError } from "../api";
import Spinner from "./Spinner";

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
    } catch (err) {
      setErrors([{ file: "upload", detail: err instanceof Error ? err.message : "upload failed" }]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-label="Upload files"
        disabled={busy}
        className="group flex min-h-12 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-wave/40 bg-neutral-900/60 p-5 text-center transition-all hover:border-aqua hover:bg-seafoam/60 disabled:cursor-wait disabled:opacity-70"
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="flex items-center justify-center gap-2 text-sm font-medium">
          {busy ? (
            <>
              <Spinner /> Uploading
            </>
          ) : (
            "Drop files or click to upload"
          )}
        </p>
        <p className="mt-1 text-xs text-neutral-500">PDF · DOCX · TXT · MD — up to 50 MB each</p>
      </button>
      <input
        id="upload-files"
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown"
        aria-label="Choose files"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        className="min-h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 text-left text-sm font-medium text-neutral-300 transition-colors hover:border-aqua/60 hover:bg-seafoam/50"
        onClick={() => setShowPaste(!showPaste)}
      >
        <span className="flex items-center justify-between gap-3">
          <span>
            <span className="block">{showPaste ? "Hide paste editor" : "Paste text instead"}</span>
            <span className="mt-0.5 block text-xs font-normal text-neutral-500">Keep a class note or excerpt with a title.</span>
          </span>
          <span className="text-aqua">{showPaste ? "↑" : "＋"}</span>
        </span>
      </button>

      <div className="rounded-2xl border border-neutral-800/80 bg-neutral-900/30 p-4 text-sm">
        <p className="font-medium text-neutral-300">Public web URL</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">Search the web first, then add a useful result to this notebook without an AI key.</p>
      </div>

      {showPaste && (
        <form
          className="space-y-2 animate-pop-in"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            try {
              await onPaste(title.trim() || "Pasted note", text);
              setText("");
              setTitle("");
              setShowPaste(false);
            } catch (err) {
              setErrors([{ file: "paste", detail: err instanceof Error ? err.message : "paste failed" }]);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="paste-title">Paste title</label>
          <input
            id="paste-title"
            className="min-h-12 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-aqua"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="sr-only" htmlFor="paste-body">Paste body</label>
          <textarea
            id="paste-body"
            className="min-h-28 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-aqua"
            placeholder="Paste your text here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="min-h-12 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            Save source
          </button>
        </form>
      )}

      {errors.map((err, index) => (
        <p key={`${err.file}-${index}`} className="text-xs text-red-400">
          {err.file}: {err.detail}
        </p>
      ))}
    </div>
  );
}
