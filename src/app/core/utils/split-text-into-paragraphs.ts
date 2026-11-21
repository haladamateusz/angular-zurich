/**
 * Groups prose into display paragraphs of up to three sentences.
 * Normalizes existing line breaks so one-sentence paragraphs are grouped too.
 */
export function splitTextIntoParagraphs(text: string): string[] {
  const dottedWordPlaceholder = '__DOT__';
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const paragraphs: string[] = [];
  const singleLine = trimmed.replace(/\s*\n\s*/g, ' ');
  const protectedLine = singleLine.replace(/\b[\p{L}\p{N}+-]+(?:\.[\p{L}\p{N}+-]+)+\b/gu, (match) =>
    match.replaceAll('.', dottedWordPlaceholder),
  );
  const sentences = protectedLine.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/gu) ?? [protectedLine];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(
      sentences
        .slice(index, index + 3)
        .map((sentence) => sentence.trim().replaceAll(dottedWordPlaceholder, '.'))
        .join(' '),
    );
  }

  return paragraphs;
}
