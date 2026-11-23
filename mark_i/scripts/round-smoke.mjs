import WebSocket from 'ws';
const URL = 'ws://localhost:8080';

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const client = { ws, welcome: null, last: null };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') client.welcome = msg;
      if (msg.type === 'snapshot') client.last = msg;
    });
    ws.on('error', reject);
    (function poll() {
      if (client.welcome && client.last) return resolve(client);
      setTimeout(poll, 20);
    })();
  });
}

const a = await connect('SmokeA');
const b = await connect('SmokeB');
console.log('connected both. Waiting for match to start…');

const deadline = Date.now() + 45000;
let snap;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 200));
  snap = a.last;
  if (snap?.phase === 'playing') break;
}
console.log('phase reached:', snap?.phase);
console.log('timeLeftMs:', snap?.timeLeftMs, 'players:', snap?.players.map(p => `${p.name}(alive=${p.alive},x=${Math.round(p.x)},y=${Math.round(p.y)})`).join(' '));
console.log('platforms in snapshot:', snap?.platforms.length);
a.ws.close(); b.ws.close();
process.exit(snap?.phase === 'playing' ? 0 : 1);
