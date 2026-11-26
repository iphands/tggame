// @ts-check
// Game Night: draws one card per game and keeps its status fresh.

/**
 * @typedef {{
 *   id: string, title: string, tagline: string, port: number, players: string, accent: string,
 *   phases: Record<string, string>, cover: string,
 *   up: boolean, phase: string, humans: number, bots: number, capacity: number,
 * }} Game
 */

const POLL_MS = 3000;
/** At most this many little heads are drawn on a card. */
const MAX_PIPS = 10;

const shelf = /** @type {HTMLElement} */ (document.getElementById('shelf'));
const tally = /** @type {HTMLElement} */ (document.getElementById('tally'));
const empty = /** @type {HTMLElement} */ (document.getElementById('empty'));
const toast = /** @type {HTMLElement} */ (document.getElementById('toast'));

/** @type {Map<string, { el: HTMLAnchorElement, game: Game }>} */
const cards = new Map();
/** The ids on the shelf, in order; a different list means the shelf is rebuilt. */
let shelfKey = '';

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} cls
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, cls, text) {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Games live on the same machine as this page, each on its own port. @param {Game} g */
const gameUrl = (g) => `${location.protocol}//${location.hostname}:${g.port}/`;

/** @param {Game} g @param {number} index */
function buildCard(g, index) {
  const a = el('a', 'card');
  a.style.setProperty('--accent', g.accent);
  a.style.setProperty('--tilt', `${index % 2 ? 0.5 : -0.5}deg`);
  a.style.setProperty('--delay', `${index * 70}ms`);

  const cover = el('div', 'cover');
  if (g.cover) {
    const img = el('img', 'art');
    img.src = g.cover;
    img.alt = '';
    img.decoding = 'async';
    cover.append(img);
  } else {
    cover.append(el('span', 'art initial', g.title.slice(0, 1)));
  }
  const badge = el('span', 'badge');
  badge.append(el('i', 'dot'), el('span', 'badge-text'));
  const zzz = el('span', 'zzz');
  zzz.setAttribute('aria-hidden', 'true');
  zzz.append(el('i', '', 'z'), el('i', '', 'z'), el('i', '', 'z'));
  cover.append(badge, zzz);

  const body = el('div', 'body');
  const head = el('div', 'head');
  head.append(el('h2', 'title', g.title), el('span', 'go'));
  const meta = el('div', 'meta');
  meta.append(el('span', 'pips'), el('span', 'who'), el('span', 'phase'));
  body.append(head, el('p', 'tagline', g.tagline), meta);
  if (g.players) body.append(el('p', 'seats', g.players));

  a.append(cover, body);
  a.addEventListener('click', (ev) => {
    const now = cards.get(g.id)?.game;
    if (now?.up) return;
    ev.preventDefault();
    a.classList.remove('shake');
    void a.offsetWidth; // restart the animation
    a.classList.add('shake');
    say(`${g.title} is offline right now.`);
  });
  return a;
}

/** @param {HTMLElement} node @param {string} text */
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** @param {HTMLAnchorElement} a @param {Game} g @param {Game | undefined} before */
function paintCard(a, g, before) {
  const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (a.querySelector(sel));
  const busy = g.up && g.humans > 0;
  const state = !g.up ? 'down' : busy ? 'busy' : 'open';
  a.dataset.state = state;
  a.href = gameUrl(g);
  a.setAttribute('aria-disabled', String(!g.up));

  setText(q('.badge-text'), !g.up ? 'Offline' : busy ? 'Live' : 'Open');
  setText(q('.go'), g.up ? 'Play' : 'Asleep');

  const full = g.up && g.capacity > 0 && g.humans + g.bots >= g.capacity;
  let who = 'Server is napping';
  if (g.up) {
    who = g.humans > 0 ? `${g.humans} playing` : 'Nobody here yet';
    if (g.bots > 0) who += ` + ${plural(g.bots, 'bot', 'bots')}`;
    if (full) who += ' (full)';
  }
  setText(q('.who'), who);

  const phase = q('.phase');
  const label = g.up ? g.phases[g.phase] || (g.phase === 'lobby' ? 'Lobby open' : g.phase ? 'Game in progress' : '') : '';
  setText(phase, label);
  phase.hidden = !label;
  phase.classList.toggle('hot', g.up && g.phase !== 'lobby' && g.phase !== '');

  const pips = q('.pips');
  const key = `${g.up ? g.humans : 0}/${g.up ? g.bots : 0}`;
  if (pips.dataset.key !== key) {
    pips.dataset.key = key;
    pips.replaceChildren();
    if (g.up) {
      const people = Math.min(g.humans, MAX_PIPS);
      const bots = Math.min(g.bots, MAX_PIPS - people);
      for (let i = 0; i < people; i++) pips.append(el('i', 'pip'));
      for (let i = 0; i < bots; i++) pips.append(el('i', 'pip bot'));
      if (g.humans + g.bots > people + bots) pips.append(el('i', 'more', `+${g.humans + g.bots - people - bots}`));
    }
    pips.hidden = !pips.childElementCount;
    if (before) {
      pips.classList.remove('pop');
      void pips.offsetWidth;
      pips.classList.add('pop');
    }
  }

  let spoken = `${g.title}. ${who}.`;
  if (label) spoken += ` ${label}.`;
  a.setAttribute('aria-label', spoken);
}

/** @param {Game[]} games */
function render(games) {
  const key = games.map((g) => g.id).join('|');
  if (key !== shelfKey) {
    shelfKey = key;
    cards.clear();
    shelf.replaceChildren();
    games.forEach((g, i) => {
      const a = buildCard(g, i);
      cards.set(g.id, { el: a, game: g });
      paintCard(a, g, undefined);
      shelf.append(a);
    });
  } else {
    for (const g of games) {
      const card = cards.get(g.id);
      if (!card) continue;
      paintCard(card.el, g, card.game);
      card.game = g;
    }
  }
  shelf.setAttribute('aria-busy', 'false');
  empty.hidden = games.length > 0;

  const up = games.filter((g) => g.up);
  const people = up.reduce((n, g) => n + g.humans, 0);
  let line = '';
  if (games.length) {
    line = up.length === games.length ? `All ${plural(games.length, 'game', 'games')} online` : `${up.length} of ${plural(games.length, 'game', 'games')} online`;
    if (up.length) line += people ? ` · ${plural(people, 'person', 'people')} playing` : ' · nobody playing yet';
  }
  setText(tally, line);
  tally.classList.toggle('lit', people > 0);
  tally.classList.remove('lost');
}

let toastTimer = 0;
/** @param {string} text */
function say(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2600);
}

let timer = 0;
let loading = false;
async function refresh() {
  clearTimeout(timer);
  if (loading) return;
  loading = true;
  try {
    const res = await fetch('api/games', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    render((await res.json()).games);
  } catch {
    setText(tally, 'Lost touch with the game shelf. Trying again…');
    tally.classList.add('lost');
    tally.classList.remove('lit');
  } finally {
    loading = false;
    if (!document.hidden) timer = setTimeout(refresh, POLL_MS);
  }
}

// a phone coming back from the lock screen or the back button gets fresh numbers at once
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) refresh();
});
refresh();
