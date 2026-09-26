/** Title for an untitled paste: first ~6 words of the text, capped in length. */
function stripMarkdownEdges(word: string): string {
  let next = word;
  for (;;) {
    const stripped = next
      // paired wrappers first (**bold**, __bold__, ~~strike~~, `code`, *em*, _em_)
      .replace(/^(\*\*|__|~~)(.+)\1$/, "$2")
      .replace(/^(\*|_|`)(.+)\1$/, "$2")
      // then any leftover leading/trailing emphasis characters
      .replace(/^(\*|_|`|~)+/, "")
      .replace(/(\*|_|`|~)+$/, "");
    if (stripped === next) return next;
    next = stripped;
  }
}

function stripLinePrefix(line: string): string {
  return line
    .replace(/^\s*(#{1,6}\s*|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/\s+#{1,6}\s*$/, "");
}

function allCleanWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(stripMarkdownEdges)
    .filter(Boolean);
}

/** Strip a leading title-echo from a snippet ("My Notes Photosynthesis…" → "Photosynthesis…"). */
export function stripTitleEcho(title: string, snippet: string): string {
  const cleanTitle = stripMarkdownForDisplay(title).trim();
  const cleanSnippet = stripMarkdownForDisplay(snippet).trim();
  const stripped = cleanSnippet || snippet;
  if (!cleanTitle || !cleanSnippet) return stripped;
  if (cleanSnippet.length <= cleanTitle.length) return stripped;
  if (cleanSnippet.slice(0, cleanTitle.length).toLowerCase() !== cleanTitle.toLowerCase()) return stripped;
  const rest = cleanSnippet.slice(cleanTitle.length).replace(/^[\s:;\-—–·|,.]+/, "").trim();
  return rest || stripped;
}

/** Display-only markdown stripping: no rendering, just plain text. */
export function stripMarkdownForDisplay(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let next = stripLinePrefix(line.trim());
      next = next
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/~~(.+?)~~/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/(^|\W)_([^_]+)_(\W|$)/g, "$1$2$3");
      next = next.replace(/(`|~~|\*\*|__)+/g, "");
      next = next.replace(/(^|\s)(\*|_)(?=\S)/g, "$1").replace(/(?<=\S)(\*|_)(?=\s|$)/g, "");
      return next.trim();
    })
    .join("\n")
    .trim();
}

export function derivePasteTitle(text: string, maxWords = 6): string {  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "Pasted note";
  const headingLine = lines.find((line) => /^#{1,6}\s*\S/.test(line) || /^#{1,6}\S/.test(line));
  if (headingLine) {
    const full = allCleanWords(stripLinePrefix(headingLine));
    const words = full.slice(0, maxWords);
    if (words.length === 0) return "Pasted note";
    const joined = words.join(" ");
    if (joined.length > 80) return `${joined.slice(0, 77).trimEnd()}…`;
    // Ellipsis only when text was actually cut (word cap).
    return full.length > words.length ? `${joined}…` : joined;
  }
  const full = allCleanWords(lines.join(" "));
  const words = full.slice(0, maxWords);
  if (words.length === 0) return "Pasted note";
  const joined = words.join(" ");
  if (joined.length > 80) return `${joined.slice(0, 77).trimEnd()}…`;
  return full.length > words.length ? `${joined}…` : joined;
}

/**
 * De-duplicates a computed paste title against the notebook's existing
 * source titles so truncated rows stay distinguishable ("Name", "Name (2)",
 * "Name (3)", …). Exact-match only; the first free suffix wins.
 */
export function uniqueSourceTitle(base: string, existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base} (${counter})`)) counter += 1;
  return `${base} (${counter})`;
}
