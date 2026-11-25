import { sameWord } from './drawing.js';
import type { Page } from './types.js';

export type Award = { book: number; page: number; hearts: number };

export type Awards = {
  bestDoodle: Award | null;
  bestGuess: Award | null;
  /** Player id with the most hearts across all their pages. */
  crowdFavourite: { playerId: string; hearts: number } | null;
};

export const heartKey = (book: number, page: number): string => `${book}:${page}`;

/** Did the final guess match the word the owner started with? */
export function survived(pages: Page[]): boolean {
  const first = pages[0];
  const last = pages[pages.length - 1];
  return pages.length > 1 && first?.kind === 'word' && last?.kind === 'word' && sameWord(first.text, last.text);
}

/** Pick award winners from the hearts. Ties go to the earliest page; nobody wins with zero hearts. */
export function computeAwards(books: Page[][], hearts: Record<string, number>): Awards {
  let bestDoodle: Award | null = null;
  let bestGuess: Award | null = null;
  const perPlayer = new Map<string, number>();
  books.forEach((pages, book) =>
    pages.forEach((page, index) => {
      const n = hearts[heartKey(book, index)] ?? 0;
      if (n <= 0) return;
      perPlayer.set(page.by, (perPlayer.get(page.by) ?? 0) + n);
      if (page.kind === 'drawing') {
        if (!bestDoodle || n > bestDoodle.hearts) bestDoodle = { book, page: index, hearts: n };
      } else if (index > 0) {
        if (!bestGuess || n > bestGuess.hearts) bestGuess = { book, page: index, hearts: n };
      }
    }),
  );
  let crowdFavourite: Awards['crowdFavourite'] = null;
  for (const [playerId, n] of perPlayer) {
    if (!crowdFavourite || n > crowdFavourite.hearts) crowdFavourite = { playerId, hearts: n };
  }
  return { bestDoodle, bestGuess, crowdFavourite };
}
