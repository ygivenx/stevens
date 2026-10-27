import type { Piece } from './audio.js';

export function splitNote(text: string): Piece[] {
  const pieces: Piece[] = [];
  let heading: string | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    const body = paragraph.join('\n').trim();
    if (body.length > 0) pieces.push({ text: body, locator: heading ? '#' + heading : 'note' });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    if (line.trim().length === 0) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return pieces;
}

export function highlightPieces(segments: { text: string; locator?: string }[] | undefined): Piece[] {
  if (!segments || segments.length === 0) throw new Error('highlight has no segments');
  const pieces = segments.filter((segment) => segment.text.trim().length > 0).map((segment) => ({
    text: segment.text,
    locator: segment.locator ?? 'highlight',
  }));
  if (pieces.length === 0) throw new Error('highlight has no segments');
  return pieces;
}
