# Notes for agents working on Lightbikes

The party-game skeleton (roster, host, seat tokens, lobby, keyed DOM screens) and the real-time
loop come from `slurp/`. Shared code is imported from `@tggame/base`. Read `README.md` for the
rules.

## Layout

| Path | What |
|---|---|
| `shared/src/constants.ts` | every tunable number: pace, toys, the closing rim, match length, bots |
| `shared/src/sim.ts` | rules both sides run: directions, `queueTurn`, `arriveAndTurn` |
| `shared/src/arenas.ts` | the floors, their blocks, and `spawns()` |
| `shared/src/protocol.ts`, `types.ts` | messages and views |
| `server/src/world.ts` | one round: the cell grid, riding, crashes, boost, buster, slipstream, the rim |
| `server/src/bots.ts` | `pilot()` and the flood fill `room()`; also rides a dropped human's bike |
| `server/src/game.ts` | `Game extends Roster`: phases, rounds, scoring, views, snapshots |
| `server/src/index.ts` | sockets, `sync()` for state, the tick loop and `broadcast()` for snapshots |
| `client/src/live.ts` | the floor as the client knows it, fed by `arena` and `snap`; not in the store |
| `client/src/screens/play.ts` | canvas, camera, own-bike prediction, HUD, the frame loop |
| `client/src/input.ts` | taps, swipes and keys |
| `client/src/art.ts` | floor, lines and bikes: all drawn in code |

## Rules that must hold

- **`Game` and `World` are pure.** No sockets, timers, `Date.now()` or `Math.random()`: time
  comes from `step(dtMs)`, chance from the injected RNG. Tests drive them directly.
- **The server owns the simulation.** A client sends `turn`, `boost` and `bust` and nothing else
  during play. Never trust a position from a client.
- **A turn names its cell.** `turn` carries `at`, the count of the cell (the bike's `odo`) it is
  for. The client rides `LEAD_S` ahead of the server, so the cell is still ahead of the server's
  bike when the message lands, and both turn in the same place. `queueTurn` keeps `at` to the
  next few cells. Without this roughly every other turn lands a cell off and has to be corrected.
- **Collisions are cells.** `World.occ` holds 0, `WALL`, or 1 + the bike's index. A bike claims a
  cell on arriving in it. Keep it that way: no line segments, no widths.
- **Two channels.** `state` is per player and sent only when its JSON changes: keep anything that
  changes every tick out of `StateView`. `Game.rev` tells `index.ts` when a score or phase moved
  on its own. `arena` carries a whole floor once (and again to anyone who joins or reconnects),
  lines included; `snap` carries the bikes and events. A line is corner events only: a bike
  riding straight costs nothing beyond its own entry.
- **`snapshot()` drains** the events. Call it once per broadcast.
- **Others are drawn at the server's "now"**, not interpolated behind it: in a game about near
  misses, a rival drawn 75 ms late is a rival you crash into. `live.ts` puts them where the
  snapshot says and `play.ts` rides them on.
- **Every floor works for 2 to 8.** `tests/arenas.test.ts` checks every floor and rider count:
  blocks on the floor, spawns clear for ten cells, nobody walled off. New floors go in `PLANS`.
- **Bots play by the rules.** They only queue turns and press the same two buttons. They treat
  the two cells in front of every other bike as taken; that one rule removed most head-ons.
- **No round lasts for ever.** The rim closes in (`SHRINK_AFTER_MS`). A bot test checks it.
- **Tuning lives in `constants.ts`.**
- **No binary assets.** Art is canvas code, sound is WebAudio, icons are generated.
- **Its own words.** No names, art or terms from other light-cycle games or films.

## Adding a client → server message

1. Add it to `ClientMessage` and `isClientMessage` in `shared/src/protocol.ts`.
2. Add a method on `Game` that checks who and which phase.
3. Dispatch it in `handle()` in `server/src/index.ts`. If it is sent many times a second, add it
   to the messages that skip `sync()`.
4. Send it from the client with `send()`.
5. Test it in `tests/protocol.test.ts` and `tests/game.test.ts`.

## Testing

`npm test && npm run typecheck` must pass. For a live check use private ports, never 8096 or
5179 (someone may be playing there):

```sh
npm run build && PORT=8196 npx tsx server/src/index.ts   # serves the built client too
node scripts/smoke.mjs ws://localhost:8196 3             # 3 socket players and a bot, one short match
# or with hot reload: npx vite --port 5199, then open http://localhost:5199/?ws=ws://localhost:8196
```

`http://localhost:8196/?debug` puts the client's floor on `window.lightbikes`; `adopted` counts
how often the predicted bike had to be put back where the server had it (once per round is the
first snapshot; more means the lead is too short for the connection).

Commit in small conventional commits: `feat(lightbike): …`, `fix(lightbike): …`.
