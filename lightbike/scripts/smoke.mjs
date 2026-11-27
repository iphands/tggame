// Drives a few socket players through a short match against a running server, and reports what
// the wire carried. Usage: node scripts/smoke.mjs [ws://localhost:8196] [players]
// Start a server on a private port first: PORT=8196 npx tsx server/src/index.ts
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8196';
const players = Number(process.argv[3] ?? 3);

const stats = { snaps: 0, snapBytes: 0, maxSnap: 0, arenas: 0, arenaBytes: 0, states: 0, t0: 0, crashes: 0, corners: 0 };
let done = false;

function client(name, lead) {
  const ws = new WebSocket(url);
  const me = { id: '', lastTurn: 0 };
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.on('open', () => send({ type: 'join', name }));
  ws.on('message', (raw) => {
    const text = raw.toString();
    const m = JSON.parse(text);
    if (m.type === 'welcome') me.id = m.selfId;
    else if (m.type === 'state') {
      const s = m.state;
      if (lead) stats.states++;
      if (lead && s.phase === 'lobby' && s.hostId === me.id && s.players.length >= players) {
        if (!s.players.some((p) => p.bot)) send({ type: 'addBot' });
        else if (s.settings.length !== 'short') send({ type: 'settings', length: 'short', pace: 'spicy' });
        else send({ type: 'start' });
      }
      if (lead && s.phase === 'finale') finish(s);
    } else if (m.type === 'arena') {
      if (lead) {
        stats.arenas++;
        stats.arenaBytes += text.length;
        console.log(`round ${stats.arenas}: ${m.name}, ${m.w}x${m.h}, ${m.trails.length} bikes, ${text.length} bytes`);
      }
    } else if (m.type === 'snap') {
      if (lead) {
        if (!stats.t0) stats.t0 = Date.now();
        stats.snaps++;
        stats.snapBytes += text.length;
        stats.maxSnap = Math.max(stats.maxSnap, text.length);
        for (const fx of m.fx) {
          if (fx[0] === 'x') stats.crashes++;
          if (fx[0] === 'c') stats.corners++;
        }
      }
      // ride like somebody who has never seen a bike: a turn every so often, a boost now and then
      const bike = m.bikes.find((b) => b[0] === me.id);
      const now = Date.now();
      if (!bike || bike[6] & 1 || m.cd > 0 || now - me.lastTurn < 350 + Math.random() * 900) return;
      me.lastTurn = now;
      send({ type: 'turn', d: (bike[3] + (Math.random() < 0.5 ? 1 : 3)) % 4, at: bike[9] + 1 });
      if (Math.random() < 0.2) send({ type: 'boost', on: Math.random() < 0.5 });
      if (Math.random() < 0.05) send({ type: 'bust' });
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
  const name = (id) => state.players.find((p) => p.id === id)?.name ?? '?';
  console.log(`winner ${r.winner ? name(r.winner) : 'nobody'} after ${r.rounds} rounds: ${r.stats.map((s) => `${name(s.id)} ${s.score}`).join(', ')}`);
  console.log(`${stats.crashes} crashes, ${stats.corners} corners`);
  console.log(
    `${stats.snaps} snapshots in ${secs.toFixed(1)} s (rounds and the pauses between them); mean ${Math.round(stats.snapBytes / stats.snaps)} bytes, largest ${stats.maxSnap}; ` +
      `${stats.arenas} floors, mean ${Math.round(stats.arenaBytes / stats.arenas)} bytes; ${stats.states} state messages`,
  );
  const ok = r.rounds >= 1 && stats.crashes >= players && stats.snaps > 100;
  console.log(ok ? 'OK' : 'FAILED');
  process.exit(ok ? 0 : 1);
}

for (let i = 0; i < players; i++) setTimeout(() => client(`Smoke${i + 1}`, i === 0), i * 150);
setTimeout(() => {
  console.error('timed out');
  process.exit(1);
}, 300_000);
