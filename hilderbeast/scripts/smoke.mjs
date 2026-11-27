// Drives a few socket players through a round against a running server, and reports what the
// wire carried. Usage: node scripts/smoke.mjs [ws://localhost:8197] [players] [last|escape]
// Start a server on a private port first: PORT=8197 npx tsx server/src/index.ts
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8197';
const players = Number(process.argv[3] ?? 3);
const mode = process.argv[4] ?? 'last';

const stats = { snaps: 0, snapBytes: 0, maxSnap: 0, states: 0, t0: 0, seenMax: 0, events: {} };
let done = false;

function client(name, lead) {
  const ws = new WebSocket(url);
  const me = { id: '', state: null, lastIn: 0, turn: Math.random() * 6.28 };
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.on('open', () => send({ type: 'join', name }));
  ws.on('message', (raw) => {
    const text = raw.toString();
    const m = JSON.parse(text);
    if (m.type === 'welcome') me.id = m.selfId;
    else if (m.type === 'state') {
      me.state = m.state;
      if (lead) stats.states++;
      if (lead && m.state.phase === 'lobby' && m.state.hostId === me.id && m.state.players.length >= players) {
        if (m.state.settings.mode !== mode) send({ type: 'settings', mode });
        else if (m.state.players.filter((p) => p.bot).length < 2) send({ type: 'addBot' });
        else send({ type: 'start' });
      }
      if (lead && m.state.phase === 'finale') finish(m.state);
    } else if (m.type === 'snap') {
      if (lead) {
        if (!stats.t0) stats.t0 = Date.now();
        stats.snaps++;
        stats.snapBytes += text.length;
        stats.maxSnap = Math.max(stats.maxSnap, text.length);
        stats.seenMax = Math.max(stats.seenMax, m.bodies.length);
        for (const e of m.fx) stats.events[e[0]] = (stats.events[e[0]] ?? 0) + 1;
      }
      // wander: a new heading now and then, boost and action pressed at random
      const now = Date.now();
      if (now - me.lastIn < 100) return;
      me.lastIn = now;
      if (Math.random() < 0.08) me.turn = Math.random() * 6.28;
      send({ type: 'in', x: Math.round(Math.cos(me.turn) * 100) / 100, y: Math.round(Math.sin(me.turn) * 100) / 100, b: Math.random() < 0.2 ? 1 : 0, a: Math.random() < 0.15 ? 1 : 0 });
    }
  });
  ws.on('error', (e) => {
    console.error(`${name}: ${e.message}`);
    process.exit(1);
  });
  return ws;
}

function finish(state) {
  if (done) return;
  done = true;
  const secs = (Date.now() - stats.t0) / 1000;
  const r = state.result;
  console.log(`${r.mode}: ${r.winner} won (${r.why}) after ${(r.tookMs / 1000).toFixed(0)} s, ${r.catches.length} caught`);
  console.log(`snapshots: ${(stats.snaps / secs).toFixed(1)}/s, ${(stats.snapBytes / stats.snaps).toFixed(0)} bytes on average, ${stats.maxSnap} at most, ${(stats.snapBytes / secs / 1024).toFixed(1)} kB/s`);
  console.log(`most bodies in one snapshot: ${stats.seenMax}; state messages: ${stats.states}; events: ${JSON.stringify(stats.events)}`);
  for (const ws of sockets) ws.close();
  setTimeout(() => process.exit(0), 200);
}

const sockets = Array.from({ length: players }, (_, i) => client(`Smoke${i + 1}`, i === 0));
setTimeout(() => {
  console.error('no result within 7 minutes');
  process.exit(1);
}, 420_000);
