/**
 * Splits prose into display paragraphs.
 * Respects explicit blank-line breaks, then splits each block into sentences.
 */
export function splitTextIntoParagraphs(text: string): string[] {
  const dottedWordPlaceholder = '__DOT__';
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
    const protectedLine = singleLine.replace(
      /\b[\p{L}\p{N}+-]+(?:\.[\p{L}\p{N}+-]+)+\b/gu,
      (match) => match.replaceAll('.', dottedWordPlaceholder),
    );
    const sentences =
      protectedLine.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/gu) ?? [protectedLine];

    for (const sentence of sentences) {
      const normalized = sentence.trim().replaceAll(dottedWordPlaceholder, '.');

      if (normalized) {
        paragraphs.push(normalized);
      }
    }
  }

  return paragraphs;
}
