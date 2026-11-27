// End-to-end smoke test against a running server with an empty lobby:
//   PORT=8194 npx tsx server/src/index.ts &   then   node scripts/smoke.mjs ws://localhost:8194
// Four sockets play a short game: a stall gets heckled on every screen, somebody fumbles,
// rounds are won and lost, a seat reconnects, and the finale adds up.
import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8194';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};
const check = (ok, msg) => (ok ? console.log('ok  ', msg) : fail(msg));

function open(name, token) {
  const c = { name, ws: new WebSocket(URL), state: null, task: null, token: null, id: null, shouts: [] };
  c.ws.on('open', () => c.ws.send(JSON.stringify({ type: 'join', name, token })));
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'welcome') [c.id, c.token] = [m.selfId, m.token];
    if (m.type === 'task') c.task = m.task;
    if (m.type === 'state') {
      c.state = m.state;
      const sh = m.state.shout;
      if (sh && !c.shouts.some((s) => s.seq === sh.seq)) c.shouts.push(sh);
    }
  });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  return c;
}
async function until(cond, what, ms = 20_000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) fail(`timed out waiting for ${what}`);
    await sleep(20);
  }
}
/** Pass the card whose rank this hand holds least of. */
function passSensibly(c) {
  const t = c.task;
  if (!t?.drawn) return;
  const cards = [...t.hand, t.drawn];
  const n = (card) => cards.filter((k) => k[0] === card[0]).length;
  c.send({ type: 'pass', card: cards.reduce((a, b) => (n(b) < n(a) ? b : a)) });
  c.task = { ...t, drawn: null };
}

const cs = ['Ann', 'Bob', 'Cy', 'Dee'].map((n) => open(n));
await until(() => cs.every((c) => c.state), 'everyone to join');
const [ann, bob, cy, dee] = cs;
check(ann.state.phase === 'lobby' && ann.state.hostId === ann.id, 'lobby open, first player hosts');

ann.send({ type: 'settings', rounds: 5 });
bob.send({ type: 'start' }); // not the host
await sleep(150);
check(bob.state.phase === 'lobby', 'only the host can start');
ann.send({ type: 'start' });
await until(() => cs.every((c) => c.state.phase === 'play' && c.task), 'the deal');
check(cs.every((c) => c.task.hand.length === 4), 'four cards each');
check(ann.state.round.spoons === 3, 'one spoon fewer than players');
check(!JSON.stringify(bob.state).includes(ann.task.hand[0] + '"'), "nobody else's cards in the public state");

// ---- a stall: the dealer sits on the first card and the whole table hears about it
await until(() => ann.task.drawn, 'the dealer to pick up');
await sleep(2700);
bob.send({ type: 'heckle' });
await until(() => cs.every((c) => c.shouts.some((s) => s.byId === bob.id && s.targetId === ann.id)), "Bob's heckle on every screen");
check(true, 'the Heckle button reaches every screen and names the slowest player');
await until(() => cs.every((c) => c.shouts.some((s) => s.byId === null && s.kind === 'heckle' && s.targetId === ann.id)), 'the automatic heckle', 6000);
check(true, 'the game heckles a stalled player on its own');
await until(() => dee.shouts.some((s) => s.level === 2), 'a ruder second heckle', 6000);
check(true, 'heckles escalate');

// ---- a fumble
const lossesBefore = cy.state.players.find((p) => p.id === cy.id).losses;
if (!cy.task.quad) {
  cy.send({ type: 'grab' });
  await until(() => ann.shouts.some((s) => s.kind === 'fumble' && s.targetId === cy.id), 'the fumble shout');
  check(ann.state.players.find((p) => p.id === cy.id).losses === lossesBefore + 1, 'a grab at nothing costs a loss');
  check(ann.state.round.spoonsLeft === 3, 'and takes no spoon');
}

// ---- a reconnect mid-round keeps the seat and the cards
const deeCards = JSON.stringify(dee.task.hand);
dee.ws.close();
await sleep(200);
const dee2 = open('Dee', dee.token);
await until(() => dee2.task && dee2.state, 'Dee to come back');
check(dee2.id === dee.id, 'a token reclaims the seat');
check(JSON.stringify(dee2.task.hand) === deeCards || dee2.task.hand.length === 4, 'with a hand of four');
cs[3] = dee2;

// ---- play it out: everyone passes, everyone grabs when they should, Dee is always a bit late
let rounds = 0;
let lastRound = 0;
const t0 = Date.now();
while (cs[0].state.phase !== 'finale') {
  if (Date.now() - t0 > 240_000) fail('the game did not finish');
  const s = cs[0].state;
  if (s.phase === 'reveal') {
    if (s.result.round !== lastRound) {
      lastRound = s.result.round;
      rounds++;
      check(s.result.loserIds.length >= 1 && s.result.grabs.length === 3, `round ${lastRound}: three spoons taken, somebody spoonless`);
      ann.send({ type: 'skip' });
    }
  } else if (s.phase === 'play') {
    for (const c of cs) {
      const meNow = c.state.players.find((p) => p.id === c.id);
      if (meNow.hasSpoon) continue;
      const scramble = c.state.round.spoonsLeft < c.state.round.spoons;
      if (c.task?.quad || (scramble && (c !== cs[3] || c.state.round.spoonsLeft === 0))) c.send({ type: 'grab' });
      else passSensibly(c);
    }
  }
  await sleep(15);
}
check(rounds === 5, 'five rounds played');
const final = cs[0].state.players;
check(final.every((p) => !p.spectator), 'everyone played every round');
check(final.reduce((n, p) => n + p.losses, 0) >= 5, 'losses add up');
check(final.find((p) => p.id === ann.id).slowMs > 0, 'the stall is on the slowpoke record');
ann.send({ type: 'again' });
await until(() => cs.every((c) => c.state.phase === 'lobby'), 'the lobby again');
check(true, 'back to the lobby');
for (const c of cs) c.send({ type: 'leave' });
await sleep(200);
for (const c of cs) c.ws.close();
console.log('smoke test passed');
process.exit(0);
