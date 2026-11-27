/** The shared show-and-tell: one book at a time, one page at a time. */
import { sfx } from '../audio';
import { h, reducedMotion } from '@tggame/base/client/dom';
import { isHost, nameOf, player, send, store } from '../store';
import type { Screen } from './index';
import { pageCard, syncHearts, verdictCard } from './thread';

export function revealScreen(): Screen {
  let book = -1;
  let rendered = 0;
  let verdict = false;
  let firstPaint = true;

  const cover = h('div', { class: 'cover' });
  const thread = h('div', { class: 'thread' });
  const next = h('button', { class: 'btn primary big', type: 'button', onclick: () => send({ type: 'next' }) });
  const waiting = h('p', { class: 'reveal-wait' });
  const bar = h('div', { class: 'reveal-bar' }, next, waiting);
  const scroller = h('div', { class: 'reveal-scroll' }, cover, thread);
  const el = h('section', { class: 'screen reveal' }, scroller, bar);

  const toBottom = () =>
    requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' }));

  return {
    el,
    update() {
      const s = store.state!;
      const r = s.reveal;
      if (!r) return;
      const pages = store.books.get(r.book) ?? [];
      const owner = player(r.ownerId);

      if (r.book !== book) {
        book = r.book;
        rendered = 0;
        verdict = false;
        thread.replaceChildren();
        cover.replaceChildren(
          h('span', { class: 'cover-count' }, `Book ${r.book + 1} of ${s.seats.length}`),
          h('h2', { class: 'cover-title', style: `--c:${owner?.color ?? '#ffd23f'}` }, `${owner?.name ?? 'Someone'}'s sketchbook`),
        );
        cover.classList.remove('pop');
        void cover.offsetWidth; // restart the animation
        cover.classList.add('pop');
        scroller.scrollTop = 0;
      }

      const upto = Math.min(r.shown, pages.length);
      while (rendered < upto) {
        // only the page that was just flipped gets the show; a reconnect paints the rest quietly
        const fresh = !firstPaint && rendered === upto - 1;
        thread.append(pageCard(r.book, rendered, pages[rendered], fresh));
        if (fresh) {
          sfx.flip();
          toBottom();
        }
        rendered++;
      }
      if (!verdict && upto === r.pageCount && pages.length === r.pageCount) {
        verdict = true;
        thread.append(verdictCard(pages, !firstPaint));
        toBottom();
      }
      if (firstPaint) toBottom();
      firstPaint = false;
      syncHearts(thread);

      const mine = r.ownerId === s.selfId;
      const canFlip = mine || isHost();
      const last = r.book === s.seats.length - 1;
      next.hidden = !canFlip;
      waiting.hidden = canFlip;
      next.disabled = store.status !== 'connected';
      next.textContent =
        r.shown < r.pageCount ? 'Flip the page ➜' : last ? 'To the finale! 🎉' : `Next: ${nameOf(s.seats[r.book + 1])}'s book ➜`;
      waiting.textContent = `${nameOf(r.ownerId)} is flipping the pages…`;
    },
  };
}
