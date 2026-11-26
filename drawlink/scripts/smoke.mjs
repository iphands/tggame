// Plays a short game over real WebSockets and checks what each socket was sent.
// Usage: node scripts/smoke.mjs [ws://localhost:8089]   (needs a server with an empty lobby)
import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8089';
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

function client(name, token) {
  const ws = new WebSocket(URL);
  const c = { name, ws, state: null, task: null, canvas: { turn: -1, strokes: [] }, chat: [], token: '', id: '', booted: false, raw: [] };
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    c.raw.push(m);
    if (m.type === 'welcome') Object.assign(c, { id: m.selfId, token: m.token });
    else if (m.type === 'task') c.task = m.task;
    else if (m.type === 'state') c.state = m.state;
    else if (m.type === 'chat') c.chat.push(...m.lines);
    else if (m.type === 'booted') c.booted = true;
    else if (m.type === 'canvas') c.canvas = { turn: m.turn, strokes: m.strokes };
    else if (m.type === 'ink' && m.turn === c.canvas.turn) {
      if (m.i === c.canvas.strokes.length) c.canvas.strokes.push({ c: m.c, w: m.w, p: [] });
      c.canvas.strokes[m.i].p.push(...m.p);
    } else if (m.type === 'undo' && m.turn === c.canvas.turn) c.canvas.strokes.pop();
    else if (m.type === 'clear' && m.turn === c.canvas.turn) c.canvas.strokes = [];
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.ready = new Promise((res, rej) => {
    ws.on('open', () => {
      c.send({ type: 'join', name, token });
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
const scoreOf = (c, id = c.id) => c.state.players.find((p) => p.id === id)?.score;

const N = 5;
const cs = Array.from({ length: N }, (_, i) => client(`Smoke${i + 1}`));
await Promise.all(cs.map((c) => c.ready));
await until('lobby', () => cs.every((c) => c.state?.players.length === N));
if (cs[0].state.phase !== 'lobby') fail('server is not in the lobby; use a private server');
const host = cs.find((c) => c.state.hostId === c.id);
host.send({ type: 'settings', rounds: 5, hints: true });
await until('settings', () => cs.every((c) => c.state.settings.rounds === 5));
host.send({ type: 'start' });
await until('round 1', () => cs.every((c) => c.state.phase === 'draw'));

// ---- round 1: live ink, then a correct guess
let drawer = cs.find((c) => c.id === c.state.round.drawerId);
await until('the word', () => drawer.task?.word);
const others = () => cs.filter((c) => c !== drawer);
if (others().some((c) => c.task)) fail('a guesser was sent the word');
const turn = drawer.state.round.turn;
await until('fresh canvases', () => cs.every((c) => c.canvas.turn === turn));
drawer.send({ type: 'ink', i: 0, c: 1, w: 11, p: [100, 100] });
drawer.send({ type: 'ink', i: 0, c: 1, w: 11, p: [200, 150, 300, 100] });
drawer.send({ type: 'ink', i: 1, c: 4, w: 5, p: [500, 500, 600, 600] });
drawer.send({ type: 'ink', i: 2, c: -1, w: 16, p: [10, 10] });
drawer.send({ type: 'undo' });
const want = JSON.stringify([{ c: 1, w: 11, p: [100, 100, 200, 150, 300, 100] }, { c: 4, w: 5, p: [500, 500, 600, 600] }]);
await until('ink to reach every guesser', () => others().every((c) => JSON.stringify(c.canvas.strokes) === want));
if (drawer.raw.some((m) => m.type === 'ink' || m.type === 'undo')) fail('the drawer was echoed their own ink');

// someone arriving mid-turn gets the canvas as it stands (the table has room: 16 seats)
const late = client('Latecomer');
await late.ready;
await until('late canvas', () => JSON.stringify(late.canvas.strokes) === want && late.state?.phase === 'draw');
if (late.task) fail('the latecomer was sent the word');

// ink that does not fit makes the server send the drawer the real canvas
drawer.send({ type: 'ink', i: 9, c: 1, w: 11, p: [1, 1] });
await until('resync', () => drawer.raw.filter((m) => m.type === 'canvas' && m.turn === turn).length >= 2 && JSON.stringify(drawer.canvas.strokes) === want);

// whisper: two people see it
others()[0].send({ type: 'chat', text: 'pssst', to: others()[1].id });
await until('whisper', () => others()[1].chat.some((l) => l.kind === 'whisper' && l.text === 'pssst'));
await sleep(100);
if (others()[2].chat.some((l) => l.text === 'pssst') || drawer.chat.some((l) => l.text === 'pssst')) fail('a whisper leaked');

others()[0].send({ type: 'chat', text: 'definitely a horse' });
await sleep(300);
const word = drawer.task.word;
const winner = others()[1];
winner.send({ type: 'chat', text: word });
await until('round result', () => [...cs, late].every((c) => c.state.phase === 'between' && c.state.result?.word === word));
if (winner.state.result.winnerId !== winner.id) fail('wrong winner');
const award = winner.state.result.award;
if (award !== 120 && award !== 110) fail(`unexpected award ${award}`);
if (scoreOf(cs[0], winner.id) !== award || scoreOf(cs[0], drawer.id) !== award) fail('scores do not match the award');
for (const c of others()) {
  const before = c.raw.slice(0, c.raw.findIndex((m) => m.type === 'state' && m.state.phase === 'between'));
  if (JSON.stringify(before).toLowerCase().includes(`"${word.toLowerCase()}"`)) fail(`${c.name} saw the word during the round`);
}

// ---- round 2 starts by itself with the next player and a clean page
await until('round 2', () => cs.every((c) => c.state.phase === 'draw' && c.state.round.round === 2), 9000);
const first = drawer;
drawer = cs.find((c) => c.id === c.state.round.drawerId);
if (drawer === first) fail('the pen did not move on');
await until('clean page', () => cs.every((c) => c.canvas.turn === drawer.state.round.turn && c.canvas.strokes.length === 0));

// pass: same round, new drawer, new word
await until('second word', () => drawer.task?.word);
const passed = drawer.task.word;
drawer.send({ type: 'pass' });
await until('pass', () => cs.every((c) => c.state.round.drawerId !== drawer.id && c.state.round.round === 2));
await until('pass in chat', () => cs[0].chat.some((l) => l.kind === 'info' && l.text.includes(passed)));

// reconnect with the seat token resumes the same player, score included
const again = client('ignored', winner.token);
await again.ready;
await until('resume', () => again.id === winner.id && scoreOf(again) === award && again.canvas.turn === cs[0].canvas.turn);
await until('old socket replaced', () => winner.ws.readyState === WebSocket.CLOSED);

// vote the latecomer out: 6 seated humans here, so 4 votes
const voters = cs.filter((c) => c !== winner).slice(0, 4);
if (voters[0].state.bootNeed !== 4) fail(`expected to need 4 votes, got ${voters[0].state.bootNeed}`);
for (const v of voters) v.send({ type: 'boot', playerId: late.id });
await until('boot', () => late.booted && cs[0].state.players.every((p) => p.id !== late.id));
const sneak = client('Sneak', late.token);
await sneak.ready;
await until('ban', () => sneak.booted);

host.send({ type: 'abort' });
await until('back in lobby', () => cs[0].state.phase === 'lobby');
for (const c of [...cs, late, again, sneak]) c.ws.close();
await sleep(150);
console.log('smoke test passed');
process.exit(0);
