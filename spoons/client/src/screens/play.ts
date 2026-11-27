import { rankPlural, type Card } from '../../../shared/src/cards';
import { HECKLE_BUTTON_MIN_MS, HECKLE_COOLDOWN_MS, HECKLE_STEP_MS, SHOUT_MS } from '../../../shared/src/constants';
import type { PlayerView, ResultView, StateView } from '../../../shared/src/types';
import { sfx } from '../audio';
import { cardEl, spoonEl } from '../cards';
import { h, tilt } from '../dom';
import { isHost, isSeated, me, nameOf, player, send, serverNow, store } from '../store';
import { seconds } from './finale';
import type { Screen } from './index';

type SeatRefs = { el: HTMLElement; tags: HTMLElement; losses: HTMLElement; spoon: HTMLElement; pile: HTMLElement; stall: HTMLElement };

/** The table for a whole game: the ring of players, the spoons, your hand, and each round's result. */
export function playScreen(): Screen {
  const seatsEl = h('div', { class: 'seats' });
  const shoutEl = h('div', { class: 'shout', role: 'status', hidden: true });
  const spoonsEl = h('button', { class: 'spoons', type: 'button', 'aria-label': 'Grab a spoon' });
  const tableEl = h('div', { class: 'table' }, spoonsEl, shoutEl);
  const statusEl = h('p', { class: 'table-status' });
  const handEl = h('div', { class: 'hand' });
  /** "+N" on the card in hand: how many more are queued up for this player. */
  const pileEl = h('span', { class: 'pile-badge', hidden: true });
  let drawnEl: HTMLElement | null = null;
  const heckleBtn = h('button', { class: 'btn heckle', type: 'button' });
  const revealEl = h('div', { class: 'reveal', hidden: true });
  const el = h('section', { class: 'screen play' }, seatsEl, tableEl, statusEl, handEl, heckleBtn, revealEl);

  const seats = new Map<string, SeatRefs>();
  let seatsKey = '';
  let spoonsKey = '';
  let handKey = '';
  let revealKey = '';
  let shoutSeq = 0;
  /** The shout on screen, if any. */
  let shoutUntil = 0;
  let shoutTarget: string | null = null;
  let dealtAt = 0;
  let moving = false;
  let lastDrawn: Card | null = null;
  /** Our own clock: when the Heckle button works again. */
  let heckleReadyAt = 0;

  const started = (s: StateView): boolean => s.phase === 'play' && !!s.round && serverNow() >= s.round.startsAt;
  const who = (id: string | null): string => (id === store.state?.selfId ? 'You' : nameOf(id));

  // ---- moves

  function grab(): void {
    const s = store.state;
    const self = me();
    if (!s?.round || !self || !started(s) || self.hasSpoon || serverNow() < self.lockedUntil) return;
    send({ type: 'grab' });
    // the server decides; this is only the sound of a hand closing on a spoon it will surely get
    if (store.task?.quad || s.round.spoonsLeft < s.round.spoons) sfx.grab();
  }

  function pass(card: Card): void {
    const s = store.state;
    if (!s || !started(s) || !store.task?.drawn) return;
    send({ type: 'pass', card });
    sfx.pass();
  }

  /** Whoever has sat on a card longest, and for how long. */
  function slowest(s: StateView): { p: PlayerView; heldMs: number } | null {
    let best: { p: PlayerView; heldMs: number } | null = null;
    const now = serverNow();
    for (const p of s.players) {
      if (p.heldSince === null) continue;
      const heldMs = now - p.heldSince;
      if (!best || heldMs > best.heldMs) best = { p, heldMs };
    }
    return best;
  }

  function heckle(): void {
    if (heckleBtn.disabled) return;
    send({ type: 'heckle' });
    heckleReadyAt = Date.now() + HECKLE_COOLDOWN_MS;
    renderHeckle();
  }

  spoonsEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grab();
  });
  // keyboard activation arrives as a click with no pointer behind it
  spoonsEl.addEventListener('click', (e) => e.detail === 0 && grab());
  heckleBtn.addEventListener('click', heckle);

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea')) return;
    const task = store.task;
    if (e.key === ' ') {
      e.preventDefault();
      grab();
    } else if (e.key.toLowerCase() === 'h') heckle();
    else if (task && e.key >= '1' && e.key <= '5') {
      const card = e.key === '5' ? task.drawn : task.hand[Number(e.key) - 1];
      if (card) pass(card);
    }
  };
  document.addEventListener('keydown', onKey);

  // ---- the ring of players

  function renderSeats(s: StateView): void {
    const order = s.round?.order ?? [];
    const key = order.join();
    if (key !== seatsKey) {
      seatsKey = key;
      seats.clear();
      seatsEl.replaceChildren(
        ...order.map((id) => {
          const p = player(id);
          const refs: SeatRefs = {
            tags: h('span', { class: 'seat-tags' }),
            losses: h('span', { class: 'seat-losses' }),
            spoon: h('span', { class: 'seat-spoon', hidden: true }),
            pile: h('span', { class: 'seat-pile', hidden: true }),
            stall: h('span', { class: 'seat-stall', hidden: true }),
            el: h('div', { class: 'seat' }),
          };
          refs.spoon.append(spoonEl());
          refs.el.append(
            h('span', { class: 'avatar', style: `--c:${p?.color ?? '#fff'}` }, (p?.name ?? '?').slice(0, 1).toUpperCase()),
            h('span', { class: 'seat-name' }, p?.name ?? '?'),
            refs.tags,
            refs.spoon,
            refs.losses,
            refs.pile,
            refs.stall,
          );
          seats.set(id, refs);
          return refs.el;
        }),
      );
    }
    for (const [id, refs] of seats) {
      const p = player(id);
      if (!p) continue;
      refs.tags.replaceChildren(
        ...[id === s.selfId && h('i', { class: 'tag you' }, 'you'), id === s.round?.dealerId && h('i', { class: 'tag', title: 'Draws from the deck' }, 'deals'), !p.connected && h('i', { class: 'tag' }, 'away')].filter(
          (n): n is HTMLElement => !!n,
        ),
      );
      refs.losses.textContent = p.losses ? `✗${p.losses}` : '';
      refs.losses.title = `${p.losses} spoonless`;
      refs.spoon.hidden = !(p.hasSpoon || (s.phase === 'reveal' && s.result?.grabs.some((g) => g.id === id)));
      refs.pile.hidden = p.waiting < 1;
      refs.pile.textContent = `${p.waiting}`;
      refs.pile.title = `${p.waiting} cards waiting`;
    }
    renderStalls(s);
  }

  /** Who is sitting on a card, and how badly. Runs on the clock, not only on news from the server. */
  function renderStalls(s: StateView): void {
    const now = serverNow();
    const calm = !started(s) || s.round!.spoonsLeft < s.round!.spoons;
    for (const [id, refs] of seats) {
      const p = player(id);
      const heldMs = !calm && p && p.heldSince !== null ? now - p.heldSince : 0;
      const level = Math.min(3, Math.floor(heldMs / HECKLE_STEP_MS));
      refs.el.className = `seat${id === s.selfId ? ' me' : ''}${p && !p.connected ? ' away' : ''}${level ? ` slow${level}` : ''}${id === shoutTarget ? ' target' : ''}`;
      refs.stall.hidden = heldMs < HECKLE_BUTTON_MIN_MS;
      refs.stall.textContent = `⏳${Math.floor(heldMs / 1000)}s`;
    }
  }

  // ---- the middle of the table

  function renderSpoons(s: StateView): void {
    const r = s.round!;
    const self = me();
    const key = `${r.round}:${r.spoons}:${r.spoonsLeft}`;
    if (key !== spoonsKey) {
      spoonsKey = key;
      spoonsEl.replaceChildren(
        ...Array.from({ length: r.spoons }, (_, i) => {
          const slot = h('span', { class: `spoon-slot${i >= r.spoonsLeft ? ' gone' : ''}`, style: `--tilt:${tilt(`${r.round}/${i}`, 24)}deg` });
          slot.append(spoonEl());
          return slot;
        }),
        h('span', { class: 'spoons-hint' }, 'Tap here to grab a spoon'),
      );
    }
    const locked = !!self && serverNow() < self.lockedUntil;
    spoonsEl.classList.toggle('locked', locked);
    spoonsEl.classList.toggle('hot', !!store.task?.quad && !self?.hasSpoon && started(s));
  }

  function renderStatus(s: StateView): void {
    const r = s.round!;
    const self = me();
    const task = store.task;
    const now = serverNow();
    let text: string;
    let hot = false;
    if (!self || self.spectator || !task) text = 'You are watching this round. You get cards at the next deal.';
    else if (now < r.startsAt) text = `Look at your cards… ${Math.ceil((r.startsAt - now) / 1000)}`;
    else if (self.hasSpoon) text = 'Got one! Keep passing and look innocent.';
    else if (now < self.lockedUntil) text = `Hands off the spoons for ${Math.ceil((self.lockedUntil - now) / 1000)}…`;
    else if (task.quad) [text, hot] = ['FOUR OF A KIND! Grab a spoon!', true];
    else if (task.drawn) text = 'Tap a card to pass it on.';
    else text = 'Waiting for a card…';
    statusEl.textContent = text;
    statusEl.classList.toggle('hot', hot);
  }

  function renderHand(s: StateView): void {
    const task = store.task;
    const ready = !!task?.drawn && started(s);
    const key = JSON.stringify(task) + ready;
    if (key !== handKey) {
      handKey = key;
      handEl.className = `hand${ready ? ' ready' : ''}${task?.quad ? ' quad' : ''}`;
      drawnEl = task?.drawn ? cardEl('button', task.drawn, { type: 'button', class: 'drawn', onclick: () => pass(task.drawn!) }) : null;
      if (!task) handEl.replaceChildren();
      else {
        handEl.replaceChildren(
          ...task.hand.map((c) => cardEl('button', c, { type: 'button', style: `--tilt:${tilt(c, 2)}deg`, onclick: () => pass(c) })),
          drawnEl ?? h('div', { class: 'card slot' }, '…'),
        );
      }
    }
    // cards stacked up behind the one in hand: the badge outlives the hand's rebuilds so it does not flicker
    const waiting = drawnEl ? (me()?.waiting ?? 0) : 0;
    pileEl.hidden = waiting < 1;
    pileEl.textContent = `+${waiting}`;
    pileEl.title = `${waiting} more ${waiting === 1 ? 'card is' : 'cards are'} waiting for you`;
    pileEl.classList.toggle('lots', waiting >= 3);
    if (drawnEl && pileEl.parentElement !== drawnEl) drawnEl.append(pileEl);
  }

  function renderHeckle(): void {
    const s = store.state;
    if (!s) return;
    const slow = s.phase === 'play' && started(s) ? slowest(s) : null;
    const lagging = !!slow && slow.heldMs >= HECKLE_BUTTON_MIN_MS;
    const cooling = Date.now() < heckleReadyAt;
    const mine = lagging && slow!.p.id === s.selfId;
    heckleBtn.disabled = !lagging || mine || cooling || !isSeated() || store.status !== 'connected';
    heckleBtn.textContent = mine
      ? "📣 It's YOU they are waiting for!"
      : cooling
        ? 'Catching your breath…'
        : lagging
          ? `📣 Heckle ${slow!.p.name}!`
          : 'Nobody to heckle… yet';
  }

  // ---- shouts: heckles and fumbles, on every screen at once

  function renderShout(s: StateView): void {
    const sh = s.shout;
    if (sh && sh.seq !== shoutSeq) {
      shoutSeq = sh.seq;
      // a reconnect must not replay something shouted a while ago
      if (serverNow() - sh.at < SHOUT_MS) {
        const forMe = sh.targetId === s.selfId;
        const to = forMe ? 'YOU' : nameOf(sh.targetId);
        shoutEl.className = `shout l${sh.level}${sh.kind === 'fumble' ? ' fumble' : ''}`;
        shoutEl.replaceChildren(h('small', null, sh.kind === 'fumble' ? 'Oops!' : sh.byId ? `${who(sh.byId)} to ${to}:` : `Hey ${to}!`), sh.text);
        // restart the pop-in even when one shout replaces another
        shoutEl.hidden = true;
        void shoutEl.offsetWidth;
        shoutEl.hidden = false;
        shoutUntil = sh.at + SHOUT_MS;
        shoutTarget = sh.targetId;
        if (sh.kind === 'fumble') sfx.nope();
        else if (sh.level > 1 || forMe || sh.byId) sfx.heckle(sh.level);
        if (forMe && sh.level > 1 && sh.kind === 'heckle') {
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
          navigator.vibrate?.(sh.level > 2 ? [120, 60, 120] : 120);
        }
      }
    }
    if (!sh || serverNow() >= shoutUntil) {
      shoutEl.hidden = true;
      shoutTarget = null;
    }
  }

  // ---- the round's result

  function renderReveal(s: StateView): void {
    const r = s.result;
    revealEl.hidden = !r;
    if (!r) return;
    const key = `${s.game}:${r.round}`;
    if (key !== revealKey) {
      revealKey = key;
      revealEl.replaceChildren(buildReveal(s, r));
      if (r.loserIds.includes(s.selfId)) sfx.lose();
      else if (r.winnerId === s.selfId) sfx.tada();
      else sfx.pop();
    }
    const left = Math.max(0, Math.ceil((r.nextAt - serverNow()) / 1000));
    const last = s.round!.round >= s.round!.rounds;
    revealEl.querySelector('.next-in')!.textContent = `${last ? 'Final results' : 'Next deal'} in ${left}…`;
    const skip = revealEl.querySelector<HTMLButtonElement>('.skip')!;
    skip.hidden = !isHost();
    skip.textContent = last ? 'Show the final results' : 'Deal the next round';
  }

  function buildReveal(s: StateView, r: ResultView): HTMLElement {
    const list = (ids: string[]): string => {
      const names = ids.map(who);
      return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
    };
    const are = (ids: string[]): string => (ids.length > 1 || ids[0] === s.selfId ? 'are' : 'is');
    return h(
      'div',
      { class: 'sheet spiral' },
      h('h2', null, r.winnerId && r.cards.length ? `${who(r.winnerId)} collected four ${rankPlural(r.cards[0][0])}!` : 'Round over!'),
      r.cards.length > 0 && h('div', { class: 'quad-row' }, r.cards.map((c) => cardEl('div', c, { style: `--tilt:${tilt(c, 4)}deg` }))),
      h('p', { class: 'loser-line' }, r.loserIds.length ? `${list(r.loserIds)} ${are(r.loserIds)} spoonless!` : 'Everybody got a spoon?!'),
      h(
        'ol',
        { class: 'grab-list' },
        r.grabs.map((g, i) => h('li', null, `${i + 1}. ${who(g.id)} `, h('b', null, i === 0 ? 'first!' : `+${seconds(g.ms)}`))),
      ),
      r.fumblerIds.length > 0 && h('p', { class: 'aside' }, `Grabbed at nothing: ${list([...new Set(r.fumblerIds)])}. That counts too.`),
      r.slowpokeId && h('p', { class: 'aside' }, `🐌 Slowpoke of the round: ${who(r.slowpokeId)}, holding the table up for ${seconds(r.slowpokeMs)}.`),
      h('button', { class: 'btn primary skip', type: 'button', onclick: () => send({ type: 'skip' }) }),
      h('p', { class: 'aside next-in' }),
    );
  }

  // ---- putting it together

  function sounds(s: StateView): void {
    const r = s.round;
    if (!r || s.phase !== 'play') return;
    // a fresh deal has a fresh start time (a round is dealt again when somebody leaves)
    if (r.startsAt !== dealtAt) {
      dealtAt = r.startsAt;
      moving = false;
      if (!started(s)) sfx.deal();
    }
    if (!moving && started(s)) {
      moving = true;
      sfx.go();
    }
    const drawn = store.task?.drawn ?? null;
    if (drawn && drawn !== lastDrawn && moving) sfx.card();
    lastDrawn = drawn;
  }

  function update(): void {
    const s = store.state;
    if (!s?.round) return;
    const playing = s.phase === 'play';
    tableEl.hidden = statusEl.hidden = handEl.hidden = heckleBtn.hidden = !playing;
    renderSeats(s);
    renderShout(s);
    renderReveal(s);
    if (!playing) return;
    sounds(s);
    renderSpoons(s);
    renderStatus(s);
    renderHand(s);
    renderHeckle();
  }

  // stall clocks, countdowns and the heckle button run on time, not on messages
  const timer = window.setInterval(update, 200);

  return {
    el,
    update,
    destroy() {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
    },
  };
}
