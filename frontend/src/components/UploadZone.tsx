import { useEffect, useRef, useState } from "react";
import type { DuplicateRef, UploadError } from "../api";
import { derivePasteTitle, uniqueSourceTitle } from "./pasteTitle";
import Spinner from "./Spinner";

interface PasteResult {
  saved?: boolean;
  duplicate_of?: DuplicateRef | null;
}

interface Props {
  onUpload: (files: File[]) => Promise<UploadError[]>;
  onPaste: (title: string, text: string, opts?: { force?: boolean }) => Promise<PasteResult | void>;
  existingTitles?: string[];
  /**
   * Round 25 item 2: external expand epoch (App bumps it from the
   * "Paste it as a source →" link and post-create reveal). A change while
   * mounted opens the paste editor, focuses the title input (via the
   * existing showPaste effect), and announces "Paste form open". A fresh
   * mount adopts the current value as seen, so switching notebooks never
   * pops the editor open on its own.
   */
  expandSignal?: number;
}

export default function UploadZone({ onUpload, onPaste, existingTitles = [], expandSignal = 0 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [duplicate, setDuplicate] = useState<DuplicateRef | null>(null);
  // Bulk-paste flow: after a successful save the editor stays open with an
  // inline confirmation and a cleared draft, so the next paste needs no
  // reopening. File uploads are untouched by this state.
  const [savedTick, setSavedTick] = useState(false);
  // Title-collision note: when the requested title already existed, App
  // suffixes it ("Name (2)"). The note names both so the silent rename is
  // visible in the same Saved region.
  const [suffixNote, setSuffixNote] = useState<string | null>(null);
  // Duplicate-warn focus: when the "already have this exact text" warn
  // appears, keyboard focus stays in the textarea and users tab past the
  // Save-anyway choice. Move focus into the warn region on appear.
  const duplicateRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (duplicate) duplicateRef.current?.focus();
  }, [duplicate]);
  // Round 18: expanding the paste editor moves focus into the title input
  // so keyboard/SR users start where the editor points.
  const pasteTitleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (showPaste && !duplicate) pasteTitleRef.current?.focus();
  }, [showPaste, duplicate]);
  // Round 25 item 2: polite announcement for externally-triggered expands
  // (start-here link, post-create reveal). Keyed by expand count so repeats
  // re-announce even with identical text.
  const [pasteAnnouncement, setPasteAnnouncement] = useState<string | null>(null);
  const [pasteExpandCount, setPasteExpandCount] = useState(0);
  const expandSeenRef = useRef(expandSignal);
  useEffect(() => {
    if (expandSeenRef.current === expandSignal) return;
    expandSeenRef.current = expandSignal;
    setShowPaste(true);
    setPasteExpandCount((count) => count + 1);
    setPasteAnnouncement("Paste form open");
  }, [expandSignal]);
  // Save completion disables the busy submit under focus, which would drop
  // focus to BODY — move it to the Saved status region instead.
  const savedRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (savedTick && !duplicate) savedRef.current?.focus();
  }, [savedTick, duplicate]);

  /** Successful save: keep the editor open, clear the draft, confirm inline. */
  function markPasteSaved(note: string | null) {
    setText("");
    setTitle("");
    setDuplicate(null);
    setSuffixNote(note);
    setSavedTick(true);
  }

  function togglePasteEditor() {
    if (showPaste) {
      // Collapsing dismisses transient warn/saved states; the draft stays.
      setDuplicate(null);
      setSavedTick(false);
      setSuffixNote(null);
    }
    setShowPaste(!showPaste);
  }

  async function savePaste(force: boolean) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setSavedTick(false);
    setSuffixNote(null);
    try {
      const computedTitle = title.trim() || derivePasteTitle(text);
      // The force flag is only sent on the explicit Save-anyway confirm so
      // the initial save keeps its original (title, text) call shape.
      const result = (force
        ? await onPaste(computedTitle, text, { force: true })
        : await onPaste(computedTitle, text)) as PasteResult | void;
      const hint = result && typeof result === "object" ? result.duplicate_of ?? null : null;
      // Round 22 item 6: only an explicit saved:true (a real 201 save, even
      // with a legacy duplicate_of echo) clears the draft and confirms — the
      // warn must never appear for just-saved text. saved:false
      // (warn-BEFORE-save: nothing persisted) — or a hint with no saved
      // field at all (legacy shape) — warns and keeps the draft.
      const savedExplicit =
        !!result && typeof result === "object" && result.saved === true;
      if (!savedExplicit && hint && hint.id && hint.title) {
        setDuplicate(hint);
        return;
      }
      const suffixed = uniqueSourceTitle(computedTitle, existingTitles);
      markPasteSaved(
        suffixed !== computedTitle
          ? `Already had '${computedTitle}' — saved as '${suffixed}'`
          : null,
      );
    } catch (err) {
      setErrors([{ file: "paste", detail: err instanceof Error ? err.message : "paste failed" }]);
    } finally {
      setBusy(false);
    }
  }

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
      {pasteAnnouncement && (
        <p key={pasteExpandCount} role="status" aria-label="Paste form announcement" className="sr-only">
          {pasteAnnouncement}
        </p>
      )}
      <button
        type="button"
        data-testid="dropzone"
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
        onClick={togglePasteEditor}
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
            await savePaste(false);
          }}
        >
          <label className="sr-only" htmlFor="paste-title">Paste title</label>
          <input
            id="paste-title"
            ref={pasteTitleRef}
            className="min-h-12 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-aqua disabled:opacity-60"
            placeholder="Title"
            value={title}
            disabled={busy}
            onChange={(e) => {
              setTitle(e.target.value);
              setSavedTick(false);
              setSuffixNote(null);
            }}
          />
          {title.trim() === "" && text.trim() !== "" && (
            <p className="text-xs text-neutral-500" aria-live="polite">
              Will save as: {derivePasteTitle(text)}
            </p>
          )}
          <label className="sr-only" htmlFor="paste-body">Paste body</label>
          <textarea
            id="paste-body"
            className="min-h-28 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-aqua disabled:opacity-60"
            placeholder="Paste your text here…"
            value={text}
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value);
              setSavedTick(false);
              setSuffixNote(null);
            }}
          />
          {duplicate && (
            <div ref={duplicateRef} tabIndex={-1} role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 p-3 text-xs leading-relaxed text-neutral-200 outline-none">
              <p>
                You already have this exact text as &ldquo;{duplicate.title}&rdquo;. Save anyway?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
                  disabled={busy}
                  onClick={() => savePaste(true)}
                >
                  {busy ? "Saving…" : "Save anyway"}
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                  disabled={busy}
                  onClick={() => setDuplicate(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? (
              <>
                <Spinner size={13} /> Saving…
              </>
            ) : (
              "Save source"
            )}
          </button>
          {savedTick && !duplicate && (
            <p ref={savedRef} tabIndex={-1} role="status" className="text-xs font-medium text-emerald-300 outline-none">
              Saved ✓ — paste another below, or collapse the editor when done.
              {suffixNote ? ` ${suffixNote}` : ""}
            </p>
          )}
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
