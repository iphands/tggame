# Notes for agents working on Slurp

The party-game skeleton (roster, host, seat tokens, lobby, keyed DOM screens) comes from
`spoons/`; the real-time loop comes from `arena/`. Shared code is imported from `@tggame/base`.
Read `README.md` for the rules.

## Layout

| Path | What |
|---|---|
| `shared/src/constants.ts` | every tunable number: table, food tiers, growth, physics, clock, stars |
| `shared/src/sim.ts` | rules both sides run: `holeRadius`, `canEat`, `massForTier`, `moveHole`, `holeStart` |
| `shared/src/protocol.ts`, `types.ts` | messages and views |
| `server/src/world.ts` | one table: hole movement, suction, swallowing, shoving, food collisions, spills |
| `server/src/course.ts` | how much food and where; `foodCounts` guarantees the course can be cleared |
| `server/src/game.ts` | `Game extends Roster`: phases, courses, clock, stars, stats, views, snapshots |
| `server/src/bots.ts` | `botAim`; also steers a human's hole while they are disconnected |
| `server/src/index.ts` | sockets, `sync()` for state, the tick loop and `broadcast()` for snapshots |
| `client/src/live.ts` | the table as the client knows it, fed by `course` and `snap`; not in the store |
| `client/src/screens/play.ts` | canvas, camera, own-hole prediction, HUD, the frame loop |
| `client/src/predict.ts` | our hole carried forward from a snapshot through the aims sent since (a slow line) |
| `client/src/input.ts` | mouse, finger drag and keys to an aim point |
| `client/src/art.ts` | food sprites, holes, blanket: all drawn in code |

## Rules that must hold

- **`Game` and `World` are pure.** No sockets, timers, `Date.now()` or `Math.random()`: time
  comes from `step(dtMs)`, chance from the injected RNG. Tests drive them directly.
- **The server owns the simulation.** A client sends `aim` and nothing else during play; the
  server clamps it to the table. Never trust a position from a client.
- **Two channels.** `state` is per player and sent only when its JSON changes: keep anything that
  changes every tick (clock, counts, positions) out of `StateView`. `course` carries a whole
  table once (and again to anyone who joins or reconnects); `snap` carries holes, the food that
  moved, and events. Food that is not moving must cost nothing per snapshot.
- **`snapshot()` drains** the moved-food list and the events. Call it once per broadcast.
- **Every course can be cleared.** If the team splits the food evenly (the worst case), each hole
  still reaches every tier, because of `TEAM_SHARE`. `tests/course.test.ts` checks every course
  and player count. Changing tiers, growth or counts must keep that test green.
- **A leaving hole hands its mass on** (`World.removeHole`), for the same reason.
- **`moveHole` is shared** by server and client prediction. Change it in one place only, and keep
  holes free of anything the client cannot predict (they are never blocked or pushed).
- **Tuning lives in `constants.ts`.** The bot test prints how long bot teams take per course;
  the normal clock is roughly twice a solo bot's time.
- **No binary assets.** Art is canvas code, sound is WebAudio, icons are generated.

## Adding a client → server message

1. Add it to `ClientMessage` and `isClientMessage` in `shared/src/protocol.ts`.
2. Add a method on `Game` that checks who and which phase.
3. Dispatch it in `handle()` in `server/src/index.ts`.
4. Send it from the client with `send()`.
5. Test it in `tests/protocol.test.ts` and `tests/game.test.ts`.

## Testing

`npm test && npm run typecheck` must pass. For a live check use private ports, never 8095 or
5178 (someone may be playing there):

```sh
npm run build && PORT=8195 npx tsx server/src/index.ts   # serves the built client too
node scripts/smoke.mjs ws://localhost:8195 3 2           # 3 socket players, 2 courses
# or with hot reload: npx vite --port 5199, then open http://localhost:5199/?ws=ws://localhost:8195
```

Commit in small conventional commits: `feat(slurp): …`, `fix(slurp): …`.
