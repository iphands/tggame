/** Runs every game and the landing page together, each as its own process, from their builds. */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { discover } from './games.js';

const HUB_DIR = process.cwd();
const GAMES_DIR = path.resolve(HUB_DIR, process.env.GAMES_DIR ?? '..');
const ENTRY = path.join('dist', 'server', 'src', 'index.js');

const children: ChildProcess[] = [];
let stopping = false;

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  // anything still alive after a moment is not going to leave by itself
  setTimeout(() => process.exit(code), 3000).unref();
  process.exitCode = code;
}

/** Starts one server and labels each line it prints. */
function run(name: string, dir: string, env: NodeJS.ProcessEnv): void {
  if (!fs.existsSync(path.join(dir, ENTRY))) {
    console.error(`${name}: no build in ${dir}. Run "npm install && npm run build" there first.`);
    stop(1);
    return;
  }
  const child = spawn(process.execPath, [ENTRY], { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      for (const line of lines) console.log(`[${name}] ${line}`);
    });
  }
  // one server gone means a broken shelf: stop the lot and let whoever started us decide
  child.on('exit', (code, signal) => {
    if (!stopping) console.error(`[${name}] stopped (${signal ?? code}); shutting everything down`);
    stop(1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const games = discover(GAMES_DIR);
if (!games.length) console.error(`No games found in ${GAMES_DIR}`);
for (const g of games) {
  if (stopping) break;
  run(g.id, path.join(GAMES_DIR, g.id), { PORT: String(g.port) });
}
if (!stopping) run('main', HUB_DIR, { GAMES_DIR });
