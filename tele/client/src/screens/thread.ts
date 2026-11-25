/** A sketchbook read top to bottom: the shared building block of the reveal and the finale. */
import { ERASER } from '../../../shared/src/constants';
import { heartKey, survived } from '../../../shared/src/awards';
import type { Page } from '../../../shared/src/types';
import { sfx } from '../audio';
import { h, tilt } from '../dom';
import { drawingCanvas, replay } from '../render';
import { nameOf, player, send, store } from '../store';

export function verbFor(page: Page, index: number): string {
  if (page.skipped) return page.kind === 'drawing' ? 'left it blank' : 'got skipped';
  return page.kind === 'drawing' ? 'drew' : index === 0 ? 'picked' : 'guessed';
}

/** One page of a book as a card. `animate` flips it in and replays the drawing. */
export function pageCard(book: number, index: number, page: Page, animate: boolean): HTMLElement {
  const who = player(page.by);
  const key = heartKey(book, index);
  const mine = page.by === store.state?.selfId;
  const body =
    page.kind === 'word'
      ? h('div', { class: `word-note${index === 0 ? ' original' : ''}`, style: `--tilt:${tilt(key + 'w', 2)}deg` }, page.text)
      : drawingBody(page, animate);
  const heart = h(
    'button',
    {
      class: 'heart',
      type: 'button',
      'data-heart': key,
      disabled: mine,
      title: mine ? 'Your own page' : 'Love it',
      'aria-label': 'Heart this page',
      onclick: () => {
        sfx.heart();
        send({ type: 'heart', book, page: index });
      },
    },
    h('span', { class: 'heart-icon' }, '♥'),
    h('span', { class: 'heart-count' }),
  );
  const card = h(
    'article',
    { class: `page-card ${page.kind}${animate ? ' flip-in' : ''}${index % 2 ? ' right' : ''}` },
    h(
      'header',
      { class: 'byline' },
      h('span', { class: 'avatar', style: `--c:${who?.color ?? '#ddd'}` }, (who?.name ?? '?').slice(0, 1).toUpperCase()),
      h('b', null, mine ? 'You' : nameOf(page.by)),
      ' ',
      verbFor(page, index),
    ),
    body,
    heart,
  );
  return card;
}

function drawingBody(page: Extract<Page, { kind: 'drawing' }>, animate: boolean): HTMLElement {
  const blank = !page.strokes.some((s) => s.c !== ERASER);
  const canvas = drawingCanvas(animate ? [] : page.strokes);
  const sheet = h('div', { class: 'paper-sheet' }, canvas, blank && h('div', { class: 'blank-note' }, '(a blank page!)'));
  if (animate && !blank) {
    // let the flip land before the pen starts moving
    const t = setTimeout(() => replay(canvas, page.strokes), 420);
    sheet.addEventListener('click', () => {
      clearTimeout(t);
      replay(canvas, page.strokes);
    });
    sheet.title = 'Tap to watch it again';
  } else if (!blank) {
    sheet.addEventListener('click', () => replay(canvas, page.strokes));
    sheet.title = 'Tap to watch it drawn';
  }
  return sheet;
}

/** The verdict card shown under a fully revealed book. */
export function verdictCard(pages: Page[], animate: boolean): HTMLElement {
  const first = pages[0];
  const last = pages[pages.length - 1];
  const ok = survived(pages);
  return h(
    'div',
    { class: `verdict ${ok ? 'ok' : 'lost'}${animate ? ' stamp-in' : ''}` },
    h('div', { class: 'stamp' }, ok ? 'It survived!' : 'Lost in translation'),
    h(
      'div',
      { class: 'journey' },
      h('span', null, first.kind === 'word' ? first.text : ''),
      h('span', { class: 'arrow' }, '➜'),
      h('span', null, last.kind === 'word' ? last.text : ''),
    ),
  );
}

/** Refresh heart counts and "hearted by me" state on every card under `root`. */
export function syncHearts(root: HTMLElement): void {
  const s = store.state;
  if (!s) return;
  root.querySelectorAll<HTMLElement>('[data-heart]').forEach((btn) => {
    const key = btn.dataset.heart!;
    const n = s.hearts[key] ?? 0;
    btn.classList.toggle('on', s.myHearts.includes(key));
    btn.classList.toggle('some', n > 0);
    btn.querySelector('.heart-count')!.textContent = n ? String(n) : '';
  });
}
