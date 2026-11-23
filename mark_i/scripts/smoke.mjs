import WebSocket from 'ws';

const URL = 'ws://localhost:8080';

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const client = { ws, welcome: null, last: null, close: () => ws.close() };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') {
        client.welcome = msg;
        return;
      }
      if (msg.type === 'snapshot') {
        client.last = msg;
        return;
      }
    });
    ws.on('error', reject);
    const deadline = Date.now() + 5000;
    (function poll() {
      if (client.welcome && client.last) return resolve(client);
      if (Date.now() > deadline) return reject(new Error('timeout waiting for welcome+snapshot'));
      setTimeout(poll, 30);
    })();
  });
}

const a = await connect('Alice');
console.log('A welcome: selfId=', a.welcome.selfId, 'capacity=', a.welcome.capacity);
console.log('A snapshot: phase=', a.last.phase, 'players=', a.last.players.length, 'selfId match:', a.last.selfId === a.welcome.selfId);

a.ws.send(JSON.stringify({ type: 'input', left: true, right: false, jump: false }));
await new Promise(r => setTimeout(r, 200));

const b = await connect('Bob');
console.log('B welcome ok; A sees players=', a.last.players.map(p => p.name).join(','));
console.log('B sees players=', b.last.players.map(p => p.name).join(','));

a.close();
await new Promise(r => setTimeout(r, 400));
console.log('after A disconnects: B sees players=', b.last.players.map(p => p.name).join(','));
b.close();
console.log('SMOKE OK');
process.exit(0);
