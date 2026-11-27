// End-to-end: one human + bots on a running server play a full round to the
// results screen. Usage: node scripts/round-smoke.mjs [ws-url]
import WebSocket from 'ws';

const URL = process.argv[2] ?? process.env.WS_URL ?? 'ws://localhost:8090';
const ws = new WebSocket(URL);
let last = null;
const seenPhases = new Set();
ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'Smoke' })));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type !== 'snapshot') return;
  last = msg;
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
console.log('results:', (last?.results ?? []).map((r) => `${r.place}. ${r.name} (KOs ${r.kos})`).join(', '));
ws.close();
process.exit(last?.phase === 'ended' && last.results?.length ? 0 : 1);
