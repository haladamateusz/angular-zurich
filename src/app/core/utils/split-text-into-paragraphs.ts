/**
 * Splits prose into display paragraphs.
 * Respects explicit blank-line breaks, then splits each block into sentences.
 */
export function splitTextIntoParagraphs(text: string): string[] {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const blocks = trimmed
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const singleLine = block.replace(/\s*\n\s*/g, ' ');
    const sentences = singleLine.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/gu) ?? [singleLine];

    for (const sentence of sentences) {
      const normalized = sentence.trim();

      if (normalized) {
        paragraphs.push(normalized);
      }
    }
  }

  return paragraphs;
}
