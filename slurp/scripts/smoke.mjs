// Drives a few socket players through a course against a running server, and reports what the
// wire carried. Usage: node scripts/smoke.mjs [ws://localhost:8195] [players] [courses]
// Start a server on a private port first: PORT=8195 npx tsx server/src/index.ts
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8195';
const players = Number(process.argv[3] ?? 3);
const courses = Number(process.argv[4] ?? 2);
const EAT = 0.9;

const stats = { snaps: 0, snapBytes: 0, maxSnap: 0, courseBytes: 0, states: 0, t0: 0 };
let done = false;

function client(name, lead) {
  const ws = new WebSocket(url);
  const me = { id: '', foods: new Map(), state: null, lastAim: 0 };
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
        if (!m.state.players.some((p) => p.bot)) send({ type: 'addBot' });
        else send({ type: 'start' });
      }
      if (lead && (m.state.phase === 'finale' || (m.state.phase === 'cleared' && m.state.cleared.no >= courses))) finish(m.state);
    } else if (m.type === 'course') {
      me.foods = new Map(m.foods.map(([id, tier, x, y]) => [id, { tier, x, y }]));
      if (lead) {
        stats.courseBytes = text.length;
        console.log(`course ${m.no}: table ${m.w}x${m.h}, ${m.foods.length} pieces, ${text.length} bytes`);
      }
    } else if (m.type === 'snap') {
      if (lead) {
        if (!stats.t0) stats.t0 = Date.now();
        stats.snaps++;
        stats.snapBytes += text.length;
        stats.maxSnap = Math.max(stats.maxSnap, text.length);
      }
      for (const [id, x, y] of m.foods) {
        const f = me.foods.get(id);
        if (f) Object.assign(f, { x, y });
      }
      for (const fx of m.fx) {
        if (fx[0] === 'r') me.foods.set(fx[1], { tier: fx[4], x: fx[2], y: fx[3] });
        else me.foods.delete(fx[1]);
      }
      const hole = m.holes.find((h) => h[0] === me.id);
      const now = Date.now();
      if (!hole || now - me.lastAim < 100) return;
      me.lastAim = now;
      const R = [10, 18, 28, 40, 56];
      let best = null;
      let bd = Infinity;
      for (const f of me.foods.values()) {
        if (R[f.tier] > hole[3] * EAT) continue;
        const d = Math.hypot(f.x - hole[1], f.y - hole[2]);
        if (d < bd) [bd, best] = [d, f];
      }
      if (best) send({ type: 'aim', x: best.x, y: best.y });
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
  console.log(`phase ${state.phase}, stars ${JSON.stringify(state.stars)}${state.result ? `, result ${JSON.stringify(state.result)}` : ''}`);
  console.log(`${stats.snaps} snapshots in ${secs.toFixed(1)} s = ${(stats.snaps / secs).toFixed(1)}/s; mean ${Math.round(stats.snapBytes / stats.snaps)} bytes, largest ${stats.maxSnap}; ${((stats.snapBytes / secs) * 8 / 1000).toFixed(0)} kbit/s per player`);
  console.log(`${stats.states} state messages`);
  const ok = state.stars.length >= 1 && stats.snaps / secs > 20;
  console.log(ok ? 'OK' : 'FAILED');
  process.exit(ok ? 0 : 1);
}

for (let i = 0; i < players; i++) setTimeout(() => client(`Smoke${i + 1}`, i === 0), i * 150);
setTimeout(() => {
  console.error('timed out');
  process.exit(1);
}, 240_000);
