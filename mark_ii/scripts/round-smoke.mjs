// End-to-end: one (idle) human + bots on a running server run a full course to
// the results screen. Usage: node scripts/round-smoke.mjs [ws-url]
import WebSocket from 'ws';

const URL = process.argv[2] ?? process.env.WS_URL ?? 'ws://localhost:8081';
const ws = new WebSocket(URL);
let last = null;
let gatesDown = 0;
const seenPhases = new Set();
ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'Smoke' })));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type !== 'snapshot') return;
  last = msg;
  gatesDown += msg.fx.filter((f) => f.k === 'gatebreak').length;
  seenPhases.add(msg.phase);
});
await new Promise((r) => ws.on('open', r));
await new Promise((r) => setTimeout(r, 200));
for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ type: 'addBot' }));
ws.send(JSON.stringify({ type: 'restart' }));

const deadline = Date.now() + 200_000;
while (Date.now() < deadline && last?.phase !== 'ended') {
  await new Promise((r) => setTimeout(r, 250));
}
console.log('phases seen:', [...seenPhases].join(' → '));
const results = last?.results ?? [];
const time = (r) => (r.timeMs === null ? `${r.progress}%` : `${(r.timeMs / 1000).toFixed(1)}s`);
console.log('gates broken:', gatesDown);
console.log('results:', results.map((r) => `${r.place}. ${r.name} (${time(r)}, smashed ${r.smash})`).join(', '));
ws.close();
const finished = results.filter((r) => r.timeMs !== null).length;
process.exit(last?.phase === 'ended' && finished > 0 && gatesDown >= 2 ? 0 : 1);
