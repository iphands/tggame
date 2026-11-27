# Notes for agents working on Hilder Beast

The party-game skeleton (roster, host, seat tokens, lobby, keyed DOM screens) and the real-time
loop come from `slurp/`. Shared code is imported from `@tggame/base`. Read `README.md` for the rules.

## Layout

| Path | What |
|---|---|
| `shared/src/constants.ts` | every tunable number: speeds, boosts, the lunge, Beast doors, clocks, chores |
| `shared/src/map.ts` | the house as rows of text; `MAP`, `wallAt`, `roomAt` |
| `shared/src/sim.ts` | rules both sides run: `moveBody`, `speedOf`, `rayDist`, `sees` |
| `shared/src/protocol.ts`, `types.ts` | messages and views |
| `server/src/world.ts` | one round: bodies, boosts, pills, lunges and catches, Beast doors, chores, exits |
| `server/src/game.ts` | `Game extends Roster`: lobby, modes, who wins, views, per-player snapshots |
| `server/src/bots.ts`, `path.ts` | bots for both sides; also drive a human's body while they are disconnected |
| `server/src/index.ts` | sockets, `sync()` for state, the tick loop and `broadcast()` for snapshots |
| `client/src/live.ts` | the round as the client knows it, fed by `snap`; not in the store |
| `client/src/predict.ts` | our own body carried forward from a snapshot through the sticks sent since |
| `client/src/screens/play.ts` | canvas, camera, the dark, HUD, minimap, the frame loop |
| `client/src/input.ts` | keys, thumb stick and the two pads, read as one set of controls |
| `client/src/art.ts` | house, Cousins, Beasts, pills, doors, chores: all drawn in code |

## Rules that must hold

- **`Game` and `World` are pure.** No sockets, timers, `Date.now()` or `Math.random()`: time
  comes from `step(dtMs)`, chance from the injected RNG. Tests drive them directly.
- **The server owns the simulation.** A client sends `in` (stick, boost, action) and nothing else
  during play. The stick is cut to length 1; speed, energy, cooldowns, catches, doors, chores and
  who wins are all decided in `World` and `Game`. Never trust a position from a client.
- **A player is sent only what they can see.** `Game.snapFor` leaves out the other side unless it
  is in sight (`sees`, `SIGHT_R`), and filters events the same way. The client's dark is drawing
  only: hiding something there is not enough, it must not be in the snapshot.
- **Two channels.** `state` is per player and sent only when its JSON changes: keep anything that
  changes every tick (clock, positions, energy, chore progress) out of `StateView`. Sides are in
  `StateView` because they change only on a catch; bump `World.sidesRev` when they do.
- **`frame()` drains** the events. Call it once per broadcast, then `snapFor` per player.
- **`moveBody` and `speedOf` are shared** by the server and the client's prediction. Change them
  in one place only. Anything that moves a body by itself (the lunge dash, a Beast door) must show
  in the flags, so the client knows to stop predicting.
- **The map is code, not a message.** Both sides import `MAP`; only what changes (pills, chore
  progress) travels. `tests/sim.test.ts` checks every square can be reached and no Cousin starts
  in sight of the den.
- **Every round ends.** Both modes have a clock; `tests/bots.test.ts` plays whole bot rounds.
- **Tuning lives in `constants.ts`.** The bot test prints how each bot round went.
- **No binary assets.** Art is canvas code, sound is WebAudio, icons are generated.
- **Its own words.** Cousins, Beasts, chores, pills, Beast doors: no names, art or terms from
  other games.

## Adding a client → server message

1. Add it to `ClientMessage` and `isClientMessage` in `shared/src/protocol.ts`.
2. Add a method on `Game` that checks who and which phase.
3. Dispatch it in `handle()` in `server/src/index.ts`.
4. Send it from the client with `send()`.
5. Test it in `tests/protocol.test.ts` and `tests/game.test.ts`.

## Testing

`npm test && npm run typecheck` must pass. For a live check use private ports, never 8097 or
5180 (someone may be playing there):

```sh
npm run build && PORT=8197 npx tsx server/src/index.ts   # serves the built client too
node scripts/smoke.mjs ws://localhost:8197 3 escape      # 3 socket players and 2 bots, one round
# or with hot reload: npx vite --port 5199, then open http://localhost:5199/?ws=ws://localhost:8197
```

`?lag=125&jitter=20` pretends the line is slow and `?net=1` shows the net graph, which includes
how far the drawn body is from where the server will have it.

Commit in small conventional commits: `feat(hilderbeast): …`, `fix(hilderbeast): …`.
