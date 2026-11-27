/** The screens of a turn: pick a word, draw, guess, and wait for the others. */
import { ERASER, GUESS_MAX, INK } from '../../../shared/src/constants';
import { hasInk, sanitizeGuess } from '../../../shared/src/drawing';
import type { Drawing } from '../../../shared/src/types';
import { sfx } from '../audio';
import { h, tilt } from '@tggame/base/client/dom';
import { toast } from '../fx';
import { DrawPad } from '../pad';
import { drawingCanvas, replay } from '../render';
import { isHost, isSeated, refresh, saved, send, store } from '../store';
import { applyTextEdit } from '../textedit';
import type { Screen } from './index';

/**
 * A single-line text field whose edits are applied by script, which keeps
 * iPadOS from offering "Undo Typing" on every shake (see textedit.ts).
 */
function textField(props: Record<string, unknown>, onChange: () => void): HTMLInputElement {
  const input = h('input', { type: 'text', maxLength: GUESS_MAX, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, ...props });
  input.addEventListener('beforeinput', (e) => {
    const edit = applyTextEdit(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, e.inputType, e.data, GUESS_MAX);
    if (!edit) return;
    e.preventDefault();
    input.value = edit.value;
    input.setSelectionRange(edit.caret, edit.caret);
    onChange();
  });
  input.addEventListener('input', onChange);
  return input;
}

// ---- pick

export function pickScreen(): Screen {
  const task = store.task;
  const card = task?.kind === 'pick' ? task.card : [];
  const sync = () => (submit.disabled = !sanitizeGuess(own.value) || store.status !== 'connected');
  const own = textField({ class: 'guess-input', placeholder: 'your own word or phrase', enterKeyHint: 'go', 'aria-label': 'Your own word' }, sync);
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Use it');
  const el = h(
    'section',
    { class: 'screen pick' },
    h('h2', { class: 'headline' }, 'Pick your secret word'),
    h('p', { class: 'sub' }, "You'll draw it next."),
    h(
      'div',
      { class: 'cards' },
      card.map((word, index) =>
        h(
          'button',
          {
            class: 'word-card',
            type: 'button',
            style: `--tilt:${tilt(word, 3)}deg;--i:${index}`,
            onclick: () => {
              sfx.done();
              store.editingTurn = -1;
              send({ type: 'pick', index });
            },
          },
          word,
        ),
      ),
    ),
    h('p', { class: 'sub or' }, '…or write your own'),
    h(
      'form',
      {
        class: 'guess-form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          const text = sanitizeGuess(own.value);
          if (!text) return;
          sfx.done();
          store.editingTurn = -1;
          send({ type: 'write', text });
        },
      },
      own,
      submit,
    ),
  );
  sync();
  return { el, update: sync };
}

// ---- draw

type Draft = { game: number; turn: number; strokes: Drawing };

function loadDraft(game: number, turn: number): Drawing {
  try {
    const d = JSON.parse(saved.draft() ?? 'null') as Draft | null;
    if (d && d.game === game && d.turn === turn && Array.isArray(d.strokes)) return d.strokes;
  } catch {
    /* corrupt draft: start clean */
  }
  return [];
}

export function drawScreen(): Screen {
  const s = store.state!;
  const task = store.task;
  const word = task?.kind === 'draw' ? task.word : '';
  const from = task?.kind === 'draw' ? task.from : '';
  const ownWord = s.turn === 1;
  const pad = new DrawPad(loadDraft(s.game, s.turn));

  const swatches = INK.map((color, i) =>
    h('button', { class: 'swatch', type: 'button', style: `--c:${color}`, 'aria-label': `Colour ${i + 1}`, onclick: () => choose(i) }),
  );
  const eraser = h('button', { class: 'swatch eraser', type: 'button', title: 'Eraser', 'aria-label': 'Eraser', onclick: () => choose(ERASER) }, '⌫');
  const nibs = [0, 1, 2].map((n) =>
    h('button', { class: 'tool nib', type: 'button', 'aria-label': `Nib ${n + 1}`, onclick: () => ((pad.nib = n), (pad.filling = false), syncTools()) }, h('i', { style: `--s:${6 + n * 7}px` })),
  );
  const bucket = h('button', { class: 'tool bucket', type: 'button', title: 'Fill bucket', 'aria-label': 'Fill bucket', onclick: () => ((pad.filling = !pad.filling), (pad.erasing = false), syncTools()) });
  bucket.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5 12 5l7 7-6.5 6.5a2 2 0 0 1-2.8 0L4.5 13.3a.6.6 0 0 1 0-.8z"/><path d="M9.5 2.5 13 6"/><path d="M5 12.5h14"/><path d="M20.5 16c1 1.5 1.5 2.4 1.5 3.2a1.5 1.5 0 0 1-3 0c0-.8.5-1.7 1.5-3.2z" fill="currentColor"/></svg>';
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
          setTimeout(() => armed && Date.now() - armed >= 2400 && (clear.textContent = '🗑', (armed = 0)), 2500);
        }
      },
    },
    '🗑',
  );
  const done = h(
    'button',
    {
      class: 'btn primary done-btn',
      type: 'button',
      onclick: () => {
        if (!hasInk(pad.drawing)) return;
        sfx.done();
        store.editingTurn = -1;
        send({ type: 'draw', strokes: pad.drawing });
      },
    },
    'Done!',
  );

  function choose(c: number): void {
    pad.erasing = c === ERASER;
    if (c === ERASER) pad.filling = false;
    else pad.color = c;
    syncTools();
  }
  function syncTools(): void {
    swatches.forEach((el, i) => el.classList.toggle('on', !pad.erasing && pad.color === i));
    eraser.classList.toggle('on', pad.erasing);
    nibs.forEach((el, i) => el.classList.toggle('on', pad.nib === i && !pad.filling));
    bucket.classList.toggle('on', pad.filling);
    undo.disabled = !pad.canUndo;
    redo.disabled = !pad.canRedo;
    clear.disabled = !pad.canUndo;
    done.disabled = !hasInk(pad.drawing) || store.status !== 'connected';
  }
  pad.onChange = () => {
    saved.setDraft(JSON.stringify({ game: s.game, turn: s.turn, strokes: pad.drawing } satisfies Draft));
    syncTools();
  };
  pad.onFull = () => {
    sfx.nope();
    toast(pad.filling ? 'That is a lot of paint! Undo a fill or hand it in.' : 'This page is full! Undo something or hand it in.');
  };

  const keys = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) pad.redo();
    else pad.undo();
  };
  window.addEventListener('keydown', keys);

  const el = h(
    'section',
    { class: 'screen draw' },
    h(
      'div',
      { class: 'prompt' },
      h('span', { class: 'prompt-label' }, ownWord ? 'Draw your word' : `${from} wrote`),
      h('span', { class: 'prompt-word', style: `--tilt:${tilt(word, 1.5)}deg` }, word),
      h('span', { class: 'prompt-rule' }, 'No letters or numbers!'),
    ),
    h('div', { class: 'pad-stage' }, pad.el),
    h(
      'div',
      { class: 'tools' },
      h('div', { class: 'swatches' }, swatches, eraser),
      h('div', { class: 'tool-row' }, nibs, bucket, h('span', { class: 'gap' }), undo, redo, clear),
    ),
    done,
  );
  syncTools();

  return {
    el,
    update: syncTools,
    destroy() {
      window.removeEventListener('keydown', keys);
      pad.destroy();
    },
  };
}

// ---- guess

export function guessScreen(): Screen {
  const task = store.task;
  const strokes = task?.kind === 'guess' ? task.strokes : [];
  const from = task?.kind === 'guess' ? task.from : '';
  const blank = !hasInk(strokes);
  const canvas = drawingCanvas([]);
  const stop = replay(canvas, strokes);
  const sync = () => (submit.disabled = !sanitizeGuess(input.value) || store.status !== 'connected');
  const input = textField({ class: 'guess-input', placeholder: 'What on earth is this?', enterKeyHint: 'send', 'aria-label': 'Your guess' }, sync);
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Guess!');

  const el = h(
    'section',
    { class: 'screen guess' },
    h('p', { class: 'prompt-label center' }, blank ? `${from} left the page blank. Guess anyway!` : h('span', null, h('b', null, from), ' drew this. What is it?')),
    h('div', { class: 'pad-stage' }, h('div', { class: 'paper-sheet', title: 'Tap to watch it again', onclick: () => replay(canvas, strokes) }, canvas)),
    h(
      'form',
      {
        class: 'guess-form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          const text = sanitizeGuess(input.value);
          if (!text) return;
          sfx.done();
          store.editingTurn = -1;
          send({ type: 'guess', text });
        },
      },
      input,
      submit,
    ),
  );
  sync();
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 50);
  return { el, update: sync, destroy: stop };
}

// ---- waiting (and watching, for spectators)

const QUIPS = [
  'Great art takes time. So does this.',
  'Somewhere, an art teacher is weeping.',
  'No letters. No numbers. No mercy.',
  'It looked better in their head.',
  'Is it a horse? It is always a horse.',
  'Confidence matters more than accuracy.',
];

export function waitScreen(): Screen {
  const s0 = store.state!;
  const seated = isSeated();
  const list = h('div', { class: 'wait-list' });
  const title = h('h2', { class: 'headline' });
  const change = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        store.editingTurn = store.state!.turn;
        refresh();
      },
    },
    s0.phase === 'draw' ? 'Keep drawing' : 'Change my answer',
  );
  const el = h(
    'section',
    { class: 'screen wait' },
    h(
      'div',
      { class: 'sheet spiral' },
      title,
      h('p', { class: 'sub' }, QUIPS[(s0.turn + s0.game) % QUIPS.length]),
      list,
      seated && h('div', { class: 'row' }, change),
    ),
  );
  return {
    el,
    update() {
      const s = store.state!;
      const players = s.seats.map((id) => s.players.find((p) => p.id === id)!).filter(Boolean);
      const left = players.filter((p) => !p.done).length;
      const what = s.phase === 'pick' ? 'picking' : s.phase === 'draw' ? 'drawing' : 'guessing';
      title.textContent = seated ? `Page handed in! ${left} still ${what}…` : `You're watching. ${left} still ${what}…`;
      const host = isHost();
      list.replaceChildren(
        ...players.map((p) =>
          h(
            'div',
            { class: `wait-row${p.done ? ' done' : ''}${p.connected ? '' : ' away'}` },
            h('span', { class: 'avatar', style: `--c:${p.color}` }, p.name.slice(0, 1).toUpperCase()),
            h('span', { class: 'wait-name' }, p.name, p.id === s.selfId && h('i', { class: 'tag you' }, 'you')),
            h('span', { class: 'wait-state' }, p.done ? '✓ done' : p.connected ? h('span', { class: 'scribbling' }, '✎') : 'away'),
            host &&
              !p.done &&
              p.id !== s.selfId &&
              h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  title: 'Hand in a blank page for them',
                  onclick: () => confirm(`Skip ${p.name}? They hand in a blank page this turn.`) && send({ type: 'skip', playerId: p.id }),
                },
                'Skip',
              ),
          ),
        ),
      );
    },
  };
}
