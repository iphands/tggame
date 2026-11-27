/** The table: who is here, who holds the pen, the scores, and the whisper / vote-out buttons. */
import { h } from '@tggame/base/client/dom';
import { isSeated, refresh, send, store } from './store';

export function playersPanel(): { el: HTMLElement; update(): void } {
  const el = h('div', { class: 'people' });
  /** The player whose action buttons are showing. */
  let open: string | null = null;

  return {
    el,
    update() {
      const s = store.state!;
      const drawerId = s.phase === 'draw' || s.phase === 'between' ? s.round?.drawerId : null;
      const canVote = isSeated();
      if (open && !s.players.some((p) => p.id === open)) open = null;
      el.replaceChildren(
        ...s.players.map((p) => {
          const self = p.id === s.selfId;
          const voted = s.myBoots.includes(p.id);
          const row = h(
            'div',
            {
              class: `person${p.id === drawerId ? ' drawing' : ''}${p.connected ? '' : ' away'}${self ? ' me' : ''}${open === p.id ? ' open' : ''}`,
              onclick: self
                ? null
                : () => {
                    open = open === p.id ? null : p.id;
                    refresh();
                  },
            },
            h('span', { class: 'avatar', style: `--c:${p.color}` }, p.id === drawerId ? '✎' : p.name.slice(0, 1).toUpperCase()),
            h(
              'span',
              { class: 'person-name' },
              p.name,
              self && h('i', { class: 'tag you' }, 'you'),
              p.id === s.hostId && h('i', { class: 'tag' }, 'host'),
              p.bot && h('i', { class: 'tag' }, 'bot'),
              p.spectator && h('i', { class: 'tag' }, 'watching'),
              !p.connected && h('i', { class: 'tag' }, 'away'),
              p.boots > 0 && h('i', { class: 'tag boots', title: 'Votes to remove this player' }, `out? ${p.boots}/${s.bootNeed}`),
            ),
            !p.spectator && s.phase !== 'lobby' && h('span', { class: 'person-score' }, p.score),
          );
          if (open !== p.id) return row;
          return h(
            'div',
            { class: 'person-wrap' },
            row,
            h(
              'div',
              { class: 'person-actions' },
              !p.bot &&
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    onclick: () => {
                      store.whisperTo = p.id;
                      open = null;
                      refresh();
                    },
                  },
                  'Whisper',
                ),
              canVote &&
                h(
                  'button',
                  { class: 'btn small', type: 'button', onclick: () => send({ type: 'boot', playerId: p.id }) },
                  voted ? 'Take back vote' : `Vote out (${p.boots}/${s.bootNeed})`,
                ),
            ),
          );
        }),
      );
    },
  };
}
