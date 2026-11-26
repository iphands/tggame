/** The chat box: guesses, chatter and whispers share one log and one input line. */
import { CHAT_MAX } from '../../shared/src/constants';
import { sanitizeChat } from '../../shared/src/drawing';
import type { ChatLine } from '../../shared/src/types';
import { h } from './dom';
import { amDrawing, isSeated, player, refresh, send, store } from './store';
import { applyTextEdit } from './textedit';

/** Lines kept in the DOM. */
const SHOWN = 150;

/**
 * A single-line text field whose edits are applied by script, which keeps
 * iPadOS from offering "Undo Typing" on every shake (see textedit.ts).
 */
function textField(props: Record<string, unknown>, onChange: () => void): HTMLInputElement {
  const input = h('input', { type: 'text', maxLength: CHAT_MAX, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, ...props });
  input.addEventListener('beforeinput', (e) => {
    const edit = applyTextEdit(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, e.inputType, e.data, CHAT_MAX);
    if (!edit) return;
    e.preventDefault();
    input.value = edit.value;
    input.setSelectionRange(edit.caret, edit.caret);
    onChange();
  });
  input.addEventListener('input', onChange);
  return input;
}

function lineEl(line: ChatLine, selfId: string): HTMLElement {
  if (line.kind === 'info') return h('p', { class: 'line info' }, line.text);
  if (line.kind === 'win') return h('p', { class: 'line win' }, '★ ', line.text);
  const who = h('b', { class: 'who', style: `--c:${line.color ?? '#fff'}` }, line.fromId === selfId ? 'You' : line.from);
  if (line.kind === 'whisper') {
    const to = line.toId === selfId ? 'you' : line.to;
    return h('p', { class: 'line whisper' }, who, h('i', null, ` whispers to ${to}: `), line.text);
  }
  return h('p', { class: `line${line.fromId === selfId ? ' mine' : ''}` }, who, ' ', line.text);
}

export function chatPanel(): { el: HTMLElement; update(): void } {
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
  const sync = () => (submit.disabled = !sanitizeChat(input.value) || store.status !== 'connected');
  const input = textField({ class: 'chat-input', enterKeyHint: 'send', 'aria-label': 'Guess or chat' }, sync);
  const submit = h('button', { class: 'btn primary small', type: 'submit' }, 'Send');
  const chip = h(
    'button',
    {
      class: 'whisper-chip',
      type: 'button',
      title: 'Stop whispering',
      onclick: () => {
        store.whisperTo = null;
        refresh();
        input.focus();
      },
    },
    '',
  );
  const form = h(
    'form',
    {
      class: 'chat-form',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const text = sanitizeChat(input.value);
        if (!text) return;
        send({ type: 'chat', text, to: store.whisperTo ?? undefined });
        input.value = '';
        sync();
      },
    },
    chip,
    input,
    submit,
  );
  const el = h('div', { class: 'chat' }, log, form);

  // Follow the newest line unless the reader has scrolled up to look at something.
  let stick = true;
  log.addEventListener('scroll', () => (stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40));
  const toEnd = () => stick && (log.scrollTop = log.scrollHeight);
  new ResizeObserver(toEnd).observe(log);

  let epoch = -1;
  let lastSeq = 0;
  let lastWhisper: string | null = null;

  return {
    el,
    update() {
      const s = store.state!;
      if (epoch !== store.chatEpoch) {
        epoch = store.chatEpoch;
        lastSeq = 0;
        log.replaceChildren();
      }
      for (const line of store.chat) {
        if (line.seq <= lastSeq) continue;
        lastSeq = line.seq;
        log.append(lineEl(line, s.selfId));
      }
      while (log.childElementCount > SHOWN) log.firstElementChild!.remove();
      toEnd();

      const target = player(store.whisperTo);
      if (store.whisperTo && !target) store.whisperTo = null;
      chip.hidden = !target;
      if (target) chip.textContent = `to ${target.name} ✕`;
      if (store.whisperTo !== lastWhisper) {
        lastWhisper = store.whisperTo;
        if (lastWhisper) input.focus();
      }
      const guessing = s.phase === 'draw' && isSeated() && !amDrawing();
      input.placeholder = target ? `Whisper to ${target.name}…` : guessing ? 'Type your guess…' : 'Say something…';
      sync();
    },
  };
}
