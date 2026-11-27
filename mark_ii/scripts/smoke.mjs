// WebSocket smoke test against a running server: join, roster, bots, a forced
// round, inputs, and disconnect cleanup. Usage: node scripts/smoke.mjs [ws-url]
import WebSocket from 'ws';

const URL = process.argv[2] ?? process.env.WS_URL ?? 'ws://localhost:8091';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const c = { ws, welcome: null, last: null, fx: [], maxScroll: 0, send: (m) => ws.send(JSON.stringify(m)) };
    ws.on('open', () => c.send({ type: 'join', name }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') c.welcome = msg;
      if (msg.type === 'snapshot') {
        c.last = msg;
        c.fx.push(...msg.fx);
        c.maxScroll = Math.max(c.maxScroll, msg.scrollX);
      }
    });
    ws.on('error', reject);
    const deadline = Date.now() + 5000;
    (function poll() {
      // a snapshot sent before the join was handled carries no selfId yet
      if (c.welcome && c.last && c.last.selfId === c.welcome.selfId) return resolve(c);
      if (Date.now() > deadline) return reject(new Error('timeout waiting for welcome + snapshot'));
      setTimeout(poll, 20);
    })();
  });
}

function check(cond, msg) {
  if (!cond) {
    console.error('SMOKE FAIL:', msg);
    process.exit(1);
  }
  console.log('ok -', msg);
}

const a = await connect('Alice');
check(a.last.selfId === a.welcome.selfId, 'snapshot carries our selfId');
const b = await connect('Bob');
await sleep(150);
check(a.last.players.map((p) => p.name).join() === 'Alice,Bob', 'roster shows both players');

a.send({ type: 'addBot' });
a.send({ type: 'addBot' });
await sleep(150);
check(a.last.players.filter((p) => p.bot).length === 2, 'bots added');
a.send({ type: 'pickLevel', dir: 1 });
await sleep(100);
const level = a.last.nextLevel;

a.send({ type: 'restart' });
await sleep(150);
check(a.last.phase === 'starting', 'restart starts the countdown');
check(a.last.level === level, 'round uses the picked course');
check(a.last.scrollX === 0, 'the screen holds still during the countdown');
check(a.last.gate && a.last.gate.i === 0 && a.last.gate.hp > 0, 'the first gate is standing');
const lives = a.last.players[0].lives;
check(lives > 0 && a.last.players.every((p) => p.lives === lives && p.place === 0), 'everyone starts with full lives');

await sleep(3200);
check(a.last.phase === 'playing', 'countdown finishes into play');
a.send({ type: 'input', left: false, right: false, jump: true });
await sleep(120);
a.send({ type: 'input', left: false, right: false, jump: false });
a.send({ type: 'shoot' });
await sleep(400);
check(a.fx.some((f) => f.k === 'jump' && f.id === a.welcome.selfId), 'jump produced an fx event');
check(a.fx.some((f) => f.k === 'shot'), 'shooting produced an fx event');

// the bots run, so the screen has to follow them
await sleep(4000);
check(a.maxScroll > 100, `the screen scrolls after the bots (reached ${Math.round(a.maxScroll)} px)`);

b.ws.close();
await sleep(300);
check(!a.last.players.some((p) => p.name === 'Bob'), 'disconnect removes the player');
a.ws.close();
console.log('SMOKE OK');
process.exit(0);
