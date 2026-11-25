// Plays whole games over real WebSockets and checks the result.
// Usage: node scripts/smoke.mjs [ws://localhost:8088]   (needs a server with an empty lobby)
import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8088';
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, state: null, task: null, pages: new Map(), seen: [], token: '', id: '' };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'welcome') Object.assign(c, { id: m.selfId, token: m.token });
    else if (m.type === 'task') c.task = m.task;
    else if (m.type === 'pages') for (const r of m.pages) c.pages.set(`${r.book}:${r.index}`, r.page);
    else if (m.type === 'state') c.state = m.state;
    c.seen.push(m);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.ready = new Promise((res, rej) => {
    ws.on('open', () => {
      c.send({ type: 'join', name });
      res();
    });
    ws.on('error', rej);
  });
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, cond, ms = 5000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) fail(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

async function play(n) {
  const cs = Array.from({ length: n }, (_, i) => client(`Smoke${i + 1}`));
  await Promise.all(cs.map((c) => c.ready));
  await until('lobby', () => cs.every((c) => c.state?.players.length === n));
  if (cs[0].state.phase !== 'lobby') fail('server is not in the lobby; use a private server');
  const host = cs.find((c) => c.state.hostId === c.id);
  host.send({ type: 'start' });
  await until('pick', () => cs.every((c) => c.state.phase === 'pick' && c.task?.kind === 'pick'));
  const secrets = cs.map((c) => c.task.card[0]);

  let turn = 0;
  while (true) {
    await until(`turn ${turn}`, () => cs.every((c) => c.state.turn === turn || c.state.phase === 'reveal'));
    if (cs[0].state.phase === 'reveal') break;
    await until(`tasks of turn ${turn}`, () => cs.every((c) => c.task?.kind === c.state.phase));
    for (const [i, c] of cs.entries()) {
      // nobody may hold a page before the reveal
      if (c.pages.size) fail(`${c.name} was sent pages during play`);
      if (c.state.phase === 'pick') c.send({ type: 'pick', index: 0 });
      else if (c.state.phase === 'draw') c.send({ type: 'draw', strokes: [{ c: i % 10, w: 11, p: [100 + turn, 100 + i, 400, 300 + i] }] });
      else c.send({ type: 'guess', text: `t${turn} by ${c.name}` });
    }
    turn++;
  }

  const expectedTurns = n % 2 === 0 ? n : n - 1;
  if (turn !== expectedTurns + 1) fail(`${n} players: played ${turn} turns, expected ${expectedTurns + 1}`);

  // reveal: flip everything as the host, checking pages arrive one at a time
  let flips = 0;
  while (cs[0].state.phase === 'reveal') {
    const before = JSON.stringify(cs[0].state.reveal);
    const expected = cs[0].state.reveal.book * (expectedTurns + 1) + cs[0].state.reveal.shown;
    await until('pages', () => cs.every((c) => c.pages.size === expected));
    host.send({ type: 'next' });
    await until('flip', () => cs.every((c) => c.state.phase === 'finale' || JSON.stringify(c.state.reveal) !== before));
    if (++flips > 500) fail('reveal never ended');
  }
  await until('all pages', () => cs.every((c) => c.pages.size === n * (expectedTurns + 1)));
  for (let b = 0; b < n; b++) {
    const first = cs[1].pages.get(`${b}:0`);
    const owner = cs.find((c) => c.id === cs[0].state.seats[b]);
    if (first.kind !== 'word' || first.text !== secrets[cs.indexOf(owner)]) fail(`book ${b} does not start with its owner's word`);
    for (let p = 0; p <= expectedTurns; p++) {
      const page = cs[1].pages.get(`${b}:${p}`);
      if (page.kind !== (p % 2 === 0 ? 'word' : 'drawing')) fail(`book ${b} page ${p} is a ${page.kind}`);
    }
  }

  // hearts reach everyone
  cs[1].send({ type: 'heart', book: 0, page: 0 });
  await until('heart', () => cs.every((c) => c.state.hearts['0:0'] === (cs[0].state.seats[0] === cs[1].id ? undefined : 1)), 3000);

  // reconnect with the seat token resumes the same player, pages included
  const again = client('ignored');
  again.ready = new Promise((res) => again.ws.on('open', res));
  again.ws.removeAllListeners('open');
  again.ws.on('open', () => again.send({ type: 'join', name: 'x', token: cs[2].token }));
  await until('resume', () => again.id === cs[2].id && again.pages.size === cs[2].pages.size && again.state?.phase === 'finale');

  host.send({ type: 'again' });
  await until('back in lobby', () => cs[0].state.phase === 'lobby');
  for (const c of [...cs, again]) c.ws.close();
  await sleep(150);
  console.log(`ok: ${n} players, ${turn} turns, ${n * (expectedTurns + 1)} pages`);
}

for (const n of [4, 5, 3]) await play(n);
console.log('smoke test passed');
process.exit(0);
