/**
 * Dev tool: run bots over every course and print how they did.
 *   npx tsx scripts/bot-run.ts [bots=4] [seeds=3] [courseId]
 */
import { Game } from '../server/src/sim/game.js';
import { LEVELS } from '../shared/src/levels.js';
import { MATCH, TICK_MS } from '../shared/src/constants.js';

const bots = Number(process.argv[2] ?? 4);
const seeds = Number(process.argv[3] ?? 3);
const only = process.argv[4];

for (const [idx, level] of LEVELS.entries()) {
  if (only && level.id !== only) continue;
  for (let seed = 1; seed <= seeds; seed++) {
    const g = new Game({ seed });
    g.nextLevelIndex = idx;
    const host = g.join('Host')!.id;
    for (let i = 0; i < bots; i++) g.addBot();
    g.restart();
    const lost = new Map<number, number>();
    g.players.get(host)!.lives = 0; // the idle host just watches
    let ticks = 0;
    const deathsBefore = new Map<string, number>();
    while (g.phase !== 'ended' && ticks < (MATCH.durationMs + 20_000) / TICK_MS) {
      for (const p of g.players.values()) deathsBefore.set(p.id, p.deaths);
      const xs = new Map([...g.players.values()].map((p) => [p.id, p.x]));
      g.step(TICK_MS);
      ticks++;
      for (const p of g.players.values()) {
        if (p.bot && p.deaths > (deathsBefore.get(p.id) ?? 0)) {
          const at = Math.round((xs.get(p.id) ?? 0) / 100) * 100;
          lost.set(at, (lost.get(at) ?? 0) + 1);
        }
      }
    }
    const rows = (g.results ?? []).filter((r) => r.bot);
    const fin = rows.filter((r) => r.timeMs !== null);
    const best = fin.length ? (Math.min(...fin.map((r) => r.timeMs!)) / 1000).toFixed(1) + 's' : '-';
    const deaths = [...lost.entries()].sort((a, b) => a[0] - b[0]).map(([x, n]) => `${x}${n > 1 ? 'x' + n : ''}`).join(' ');
    console.log(
      `${level.id.padEnd(7)} seed ${seed}: ${fin.length}/${rows.length} finished, best ${best}, progress ${rows.map((r) => r.progress).join('/')}, deaths at: ${deaths || 'none'}`
    );
  }
}
