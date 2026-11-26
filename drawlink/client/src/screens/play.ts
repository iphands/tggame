/** The game itself: the shared page, the word (or what you may know of it), the clock, the table and the chat. */
import { ERASER, HINT_BLANK, INK, ROUND_MS } from '../../../shared/src/constants';
import { awardAt } from '../../../shared/src/round';
import { sfx } from '../audio';
import { chatPanel } from '../chat';
import { h, tilt } from '../dom';
import { toast } from '../fx';
import { DrawPad } from '../pad';
import { playersPanel } from '../players';
import { amDrawing, nameOf, onCanvas, send, serverNow, store } from '../store';
import type { Screen } from './index';

/** The word as guessers see it: a box per letter, filled in where a letter has been given away. */
function hintBoxes(hint: string): HTMLElement {
  return h(
    'span',
    { class: 'hint', 'aria-label': 'Letters so far' },
    [...hint].map((ch) =>
      ch === ' ' ? h('i', { class: 'gap' }) : ch === HINT_BLANK ? h('i', { class: 'box' }) : h('i', { class: /[\p{L}\p{N}]/u.test(ch) ? 'box open' : 'mark' }, ch),
    ),
  );
}

export function playScreen(): Screen {
  const pad = new DrawPad();
  const chat = chatPanel();
  const people = playersPanel();

  // ---- status line
  const word = h('div', { class: 'word-line' });
  const points = h('span', { class: 'points', title: 'What a correct guess is worth right now' });
  const fuse = h('i');
  const banner = h('div', { class: 'banner', hidden: true });

  // ---- drawer's tools
  const swatches = INK.map((color, i) =>
    h('button', { class: 'swatch', type: 'button', style: `--c:${color}`, 'aria-label': `Colour ${i + 1}`, onclick: () => choose(i) }),
  );
  const eraser = h('button', { class: 'swatch eraser', type: 'button', title: 'Eraser', 'aria-label': 'Eraser', onclick: () => choose(ERASER) }, '⌫');
  const nibs = [0, 1, 2].map((n) =>
    h('button', { class: 'tool nib', type: 'button', 'aria-label': `Nib ${n + 1}`, onclick: () => ((pad.nib = n), syncTools()) }, h('i', { style: `--s:${6 + n * 7}px` })),
  );
  const undo = h('button', { class: 'tool', type: 'button', title: 'Undo', 'aria-label': 'Undo', onclick: () => pad.undo() }, '↶');
  const redo = h('button', { class: 'tool', type: 'button', title: 'Redo', 'aria-label': 'Redo', onclick: () => pad.redo() }, '↷');
  let armed = 0;
  const clear = h(
    'button',
    {
      class: 'tool danger',
      type: 'button',
      title: 'Clear the page',
      'aria-label': 'Clear the page',
      onclick: () => {
        // two taps to wipe: the first one arms it
        if (Date.now() - armed < 2500) {
          pad.clear();
          armed = 0;
          clear.textContent = '🗑';
        } else {
          armed = Date.now();
          clear.textContent = 'Sure?';
          setTimeout(() => armed && Date.now() - armed >= 2400 && ((clear.textContent = '🗑'), (armed = 0)), 2500);
        }
      },
    },
    '🗑',
  );
  const pass = h(
    'button',
    {
      class: 'btn small pass-btn',
      type: 'button',
      title: 'Give up this word. The next player draws a new one; the round does not count.',
      onclick: () => confirm('Pass on this word? The pen goes to the next player.') && send({ type: 'pass' }),
    },
    'Pass',
  );
  const tools = h(
    'div',
    { class: 'tools', hidden: true },
    h('div', { class: 'swatches' }, swatches, eraser),
    h('div', { class: 'tool-row' }, nibs, h('span', { class: 'gap' }), undo, redo, clear, h('span', { class: 'gap' }), pass),
  );

  function choose(c: number): void {
    pad.erasing = c === ERASER;
    if (c !== ERASER) pad.color = c;
    syncTools();
  }
  function syncTools(): void {
    swatches.forEach((el, i) => el.classList.toggle('on', !pad.erasing && pad.color === i));
    eraser.classList.toggle('on', pad.erasing);
    nibs.forEach((el, i) => el.classList.toggle('on', pad.nib === i));
    undo.disabled = !pad.canUndo;
    redo.disabled = !pad.canRedo;
    clear.disabled = !pad.canUndo;
    pass.disabled = store.status !== 'connected';
  }

  pad.onInk = (i, c, w, p) => send({ type: 'ink', i, c, w, p });
  pad.onUndo = () => send({ type: 'undo' });
  pad.onClear = () => send({ type: 'clear' });
  pad.onChange = syncTools;
  pad.onFull = () => {
    sfx.nope();
    toast('This page is full! Undo something or clear it.');
  };
  pad.load(store.canvas.strokes);
  onCanvas((change) => {
    if (change.kind === 'load') pad.load(store.canvas.strokes);
    else if (change.kind === 'grew') pad.grew(change.i, change.from);
    else pad.repaint();
    syncTools();
  });

  const keys = (e: KeyboardEvent) => {
    if (!pad.enabled || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    if ((e.target as HTMLElement | null)?.closest('input')) return;
    e.preventDefault();
    if (e.shiftKey) pad.redo();
    else pad.undo();
  };
  window.addEventListener('keydown', keys);

  // ---- the clock runs on its own between state updates
  function clock(): void {
    const s = store.state;
    const r = s?.round;
    if (!s || !r || s.phase !== 'draw') {
      points.hidden = true;
      fuse.style.width = '0';
      return;
    }
    const elapsed = Math.max(0, serverNow() - r.startedAt);
    points.hidden = false;
    points.textContent = String(awardAt(elapsed));
    fuse.style.width = `${Math.max(0, 1 - elapsed / ROUND_MS) * 100}%`;
    fuse.classList.toggle('low', elapsed > ROUND_MS * 0.75);
  }
  const timer = setInterval(clock, 200);

  const el = h(
    'section',
    { class: 'screen play' },
    h('div', { class: 'status' }, word, points, h('div', { class: 'fuse' }, fuse)),
    h('div', { class: 'pad-stage' }, pad.el),
    tools,
    h('aside', { class: 'side' }, people.el, chat.el),
  );
  pad.el.append(banner);
  syncTools();

  return {
    el,
    update() {
      const s = store.state!;
      const r = s.round;
      if (!r) return;
      const drawing = amDrawing();
      pad.enabled = drawing && store.status === 'connected';
      tools.hidden = !drawing;
      el.classList.toggle('mine', drawing);

      const res = s.phase === 'between' ? s.result : null;
      if (res) {
        word.replaceChildren(h('span', { class: 'word-label' }, 'It was'), h('span', { class: 'prompt-word', style: `--tilt:${tilt(res.word, 1.5)}deg` }, res.word));
      } else if (drawing) {
        const w = store.task?.word ?? '…';
        word.replaceChildren(h('span', { class: 'word-label' }, 'Draw'), h('span', { class: 'prompt-word', style: `--tilt:${tilt(w, 1.5)}deg` }, w), h('span', { class: 'prompt-rule' }, 'No letters or numbers!'));
      } else {
        const label = h('span', { class: 'word-label' }, h('b', null, nameOf(r.drawerId)), ' is drawing');
        word.replaceChildren(...(r.hint === null ? [label] : [label, hintBoxes(r.hint)]));
      }

      banner.hidden = !res;
      if (res) {
        banner.className = `banner${res.winnerId ? ' won' : ''}`;
        banner.replaceChildren(
          res.winnerId
            ? h(
                'span',
                null,
                h('b', null, res.winnerId === s.selfId ? 'You' : nameOf(res.winnerId)),
                ` got it! +${res.award} for ${res.winnerId === s.selfId ? 'you' : nameOf(res.winnerId)} and ${res.drawerId === s.selfId ? 'you' : nameOf(res.drawerId)}.`,
              )
            : h('span', null, "Time's up! Nobody scores."),
        );
      }

      people.update();
      chat.update();
      syncTools();
      clock();
    },
    destroy() {
      clearInterval(timer);
      onCanvas(null);
      window.removeEventListener('keydown', keys);
      pad.destroy();
    },
  };
}
