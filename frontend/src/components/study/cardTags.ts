/** Tag input helpers for flashcard create/edit forms. */
export function parseCardTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const clean = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= 10) break;
    }
  }
  return out;
}

export function formatCardTags(tags: string[]): string {
  return tags.join(", ");
}
