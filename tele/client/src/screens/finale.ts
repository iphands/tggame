/** After the last book: awards, every sketchbook to re-read, and another round. */
import { computeAwards, survived } from '../../../shared/src/awards';
import type { Page } from '../../../shared/src/types';
import { sfx } from '../audio';
import { h, tilt } from '../dom';
import { confetti } from '../fx';
import { downloadBook, drawingCanvas } from '../render';
import { isHost, nameOf, player, send, store } from '../store';
import type { Screen } from './index';
import { pageCard, syncHearts, verdictCard } from './thread';

export function finaleScreen(): Screen {
  const awardsEl = h('div', { class: 'awards' });
  const covers = h('div', { class: 'books' });
  const tally = h('p', { class: 'sub' });
  const again = h('button', { class: 'btn primary big', type: 'button', onclick: () => (sfx.pop(), send({ type: 'again' })) }, 'Play again');
  const waiting = h('p', { class: 'reveal-wait' });
  let modal: HTMLElement | null = null;
  let coversFor = -1;

  const el = h(
    'section',
    { class: 'screen finale' },
    h('h2', { class: 'headline big' }, 'The End!'),
    tally,
    awardsEl,
    h('h3', { class: 'section-title' }, 'The sketchbooks'),
    covers,
    h('div', { class: 'row' }, again, waiting),
  );

  sfx.tada();
  confetti();

  const allBooks = (): Page[][] => {
    const n = store.state!.seats.length;
    return Array.from({ length: n }, (_, i) => store.books.get(i) ?? []);
  };

  function openBook(index: number): void {
    const pages = store.books.get(index) ?? [];
    const owner = nameOf(store.state!.seats[index]);
    const close = () => {
      modal?.remove();
      modal = null;
    };
    modal = h(
      'div',
      { class: 'modal', onclick: (e: Event) => e.target === modal && close() },
      h(
        'div',
        { class: 'modal-body' },
        h(
          'div',
          { class: 'modal-head' },
          h('h2', { class: 'cover-title', style: `--c:${player(store.state!.seats[index])?.color ?? '#ffd23f'}` }, `${owner}'s sketchbook`),
          h('button', { class: 'btn small', type: 'button', onclick: () => downloadBook(pages, nameOf, owner) }, 'Save PNG'),
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Close', onclick: close }, '✕'),
        ),
        h('div', { class: 'thread' }, pages.map((p, i) => pageCard(index, i, p, false)), pages.length > 1 && verdictCard(pages, false)),
      ),
    );
    document.body.append(modal);
    syncHearts(modal);
  }

  function award(title: string, icon: string, body: (HTMLElement | string)[], hearts: number): HTMLElement {
    return h(
      'div',
      { class: 'award', style: `--tilt:${tilt(title, 2)}deg` },
      h('div', { class: 'award-title' }, h('span', { class: 'award-icon' }, icon), title),
      body,
      h('div', { class: 'award-hearts' }, `♥ ${hearts}`),
    );
  }

  return {
    el,
    destroy() {
      modal?.remove();
    },
    update() {
      const s = store.state!;
      const books = allBooks();
      const kept = books.filter(survived).length;
      tally.textContent =
        kept === 0
          ? `Not one word made it home. ${books.length} sketchbooks, zero survivors.`
          : `${kept} of ${books.length} ${books.length === 1 ? 'word' : 'words'} made it home in one piece.`;

      const a = computeAwards(books, s.hearts);
      const cards: HTMLElement[] = [];
      if (a.bestDoodle) {
        const page = books[a.bestDoodle.book][a.bestDoodle.page];
        if (page.kind === 'drawing') {
          cards.push(award('Best Doodle', '🖍', [h('div', { class: 'paper-sheet mini' }, drawingCanvas(page.strokes, 360)), h('b', null, nameOf(page.by))], a.bestDoodle.hearts));
        }
      }
      if (a.bestGuess) {
        const page = books[a.bestGuess.book][a.bestGuess.page];
        if (page.kind === 'word') cards.push(award('Best Guess', '💡', [h('div', { class: 'award-word' }, `“${page.text}”`), h('b', null, nameOf(page.by))], a.bestGuess.hearts));
      }
      if (a.crowdFavourite) {
        const p = player(a.crowdFavourite.playerId);
        cards.push(
          award('Crowd Favourite', '👑', [h('span', { class: 'avatar huge', style: `--c:${p?.color ?? '#ddd'}` }, (p?.name ?? '?').slice(0, 1).toUpperCase()), h('b', null, p?.name ?? '?')], a.crowdFavourite.hearts),
        );
      }
      awardsEl.replaceChildren(...(cards.length ? cards : [h('p', { class: 'sub' }, 'No hearts yet. Open a book and tap ♥ on your favourites to hand out awards.')]));

      // covers only need building once the pages are all here
      const have = books.reduce((n, b) => n + b.length, 0);
      if (have !== coversFor) {
        coversFor = have;
        covers.replaceChildren(
          ...books.map((pages, i) => {
            const owner = player(s.seats[i]);
            const first = pages[0];
            const last = pages[pages.length - 1];
            const sketch = pages.find((p) => p.kind === 'drawing');
            return h(
              'button',
              { class: 'book', type: 'button', style: `--c:${owner?.color ?? '#ffd23f'};--tilt:${tilt('b' + i, 2)}deg`, onclick: () => (sfx.pop(), openBook(i)) },
              h('span', { class: 'book-owner' }, `${owner?.name ?? '?'}'s book`),
              sketch?.kind === 'drawing' && h('div', { class: 'paper-sheet mini' }, drawingCanvas(sketch.strokes, 360)),
              h(
                'span',
                { class: 'journey' },
                h('span', null, first?.kind === 'word' ? first.text : ''),
                h('span', { class: 'arrow' }, '➜'),
                h('span', null, last?.kind === 'word' ? last.text : ''),
              ),
              h('span', { class: `mini-stamp ${survived(pages) ? 'ok' : 'lost'}` }, survived(pages) ? 'survived' : 'lost'),
            );
          }),
        );
      }
      if (modal) syncHearts(modal);

      const host = isHost();
      again.hidden = !host;
      again.disabled = store.status !== 'connected';
      waiting.hidden = host;
      waiting.textContent = `Waiting for ${nameOf(s.hostId)} to start another round…`;
    },
  };
}
