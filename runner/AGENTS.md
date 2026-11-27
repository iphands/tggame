# AGENTS.md

Guidance for AI coding agents working in this repo. **Last Survivor Run** is a
multiplayer 2D side-scrolling co-op runner: Phaser 3 client, Node + `ws` server,
TypeScript everywhere. The server is authoritative. Clients send input and
render snapshots.

> The git root is the parent directory (`../`). This project lives in `runner/`,
> and every command below runs from here. It is a fork of `../arena/` (the
> brawler, ports 8090/5173); the two are separate projects and share no code.
> `../demo/` is unrelated.

## Commands

```bash
npm install
npm run dev          # tsx watch server (:8091) + vite client (:5174, LAN-visible) via concurrently
npm test             # vitest run (tests/**/*.test.ts), ~1s, no server needed
npm run typecheck    # client tsconfig + server tsconfig (both must pass)
npm run build        # tsc server -> dist/, vite client -> client/dist/
npm start            # node dist/server/src/index.js; serves client/dist + WS on :8091
node scripts/smoke.mjs [ws://host:port]        # protocol smoke test against a running server
node scripts/round-smoke.mjs [ws://host:port]  # bots run a full course to results
npx tsx scripts/bot-run.ts [bots] [seeds] [id] # offline: bots run every course; prints times and where they died
```

Before you call a change done, run `npm test && npm run typecheck`. Both pass on
`main`.

Env vars: `PORT` (default 8091) and `STATIC_DIR` (default `client/dist`).

Someone may already have `npm run dev` running on 8091/5174. There is one
global game per server, so don't point smoke scripts or a test browser at it:
start your own (`PORT=8191 npx tsx server/src/index.ts`, `npx vite --port 5199
--strictPort`, then open `http://localhost:5199/?ws=ws://localhost:8191`).

## Layout

```
shared/src/constants.ts  ALL tuning: TICK_HZ/TICK_MS, ARENA (screen size), PHYS, COMBAT, RUN (scroll, lives, finish), BOX (boxes, gates), MATCH, ITEMS, COLORS, BOT_NAMES
shared/src/levels.ts     LevelDef/BoxDef/GateDef, LEVELS, platformPos(), safeSpots() (respawn points)
shared/src/courses.ts    the 5 hand-built courses + the Course cursor builder (ground/gap/rise/crates/armory/block/ledge/air/gate/finish)
shared/src/types.ts      snapshot entity types (PlayerState, Fx, FeedEntry, ResultRow…)
shared/src/protocol.ts   ClientMessage / ServerMessage / SnapshotBody + isClientMessage()
server/src/index.ts      HTTP static + /health, WebSocket dispatch, message budget, 60 Hz loop, 30 Hz broadcast
server/src/sim/game.ts   Game: roster/bots, phases, lives/respawn, finish + ranking, results, snapshot()
shared/src/sim/model.ts  internal Player/Plat/Projectile/Crate/World types + reset helpers, isRacing(), activeGate()
shared/src/sim/scroll.ts    updateScroll (base pace, leader drag, gate hold + decay), armGate, breakGate
shared/src/sim/physics.ts   applyInput, stepPlayer (gravity, jumps, ice, bounce, landing, box sides, head bumps), tryDrop, separateBodies, resolveSolids
server/src/sim/boxes.ts     damageBox (+ stack collapse), damageGate, isBreakable
server/src/sim/combat.ts    applyHit (shove), stomp, fire, projectiles vs runners/boxes/gates, railgun, explode
server/src/sim/items.ts     crate spawn timer (ahead of the pack), falling/riding, pickup, grantItem
shared/src/sim/platforms.ts buildPlats (platforms, then one Plat per box), updatePlats (motion + crumble), findLanding
server/src/sim/bots.ts      thinkBot: run right, jump pits/blocks, shoot boxes and gates, stuck detector
server/src/sim/rng.ts       seedable PRNG (all sim randomness goes through World.rng)
client/src/main.ts       bootstrap (Phaser config, join flow, touch + audio unlock)
client/src/net.ts        GameClient (reconnect, input de-dupe) + defaultWsUrl() (same-origin; 5174 → 8091)
client/src/interp.ts     SnapshotBuffer: server-clock sync + interpolation, lerpScroll (pure, unit-tested)
client/src/store.ts      shared client state; onSnapshot() feeds buffer + fx queue
client/src/lobby.ts      DOM overlay: join/lobby/game screens, roster, course picker, buttons
client/src/controls.ts   touch buttons → touchInput / fireHeld / requests (DOM-free at import)
client/src/audio.ts      WebAudio synthesized sfx (play('hit') etc.), mute persisted
client/src/art/          color helpers, sprites.ts (runner sheets, items, boxes, gate, fx textures), themes.ts (backdrops, layers, platforms)
client/src/view/         LevelView (course pieces near the screen), FighterView, Hud, Particles
client/src/scenes/       Boot (bake textures) → Lobby (live course preview) → Arena (render + input + fx + camera)
                         HudScene: HUD overlay launched by Arena (unzoomed); shares `view` (visible world rect)
client/src/fullscreen.ts Fullscreen API / standalone detection; manifest in client/public/
scripts/make-icons.mjs   generates client/public/icons/*.png (gitignored) before dev/build
scripts/bot-run.ts       dev tool: bots run every course offline (course tuning)
tests/sim/               sim tests (helpers.ts: newGame/newRun/newCustom/flatWorld/startMatch/run/place/park)
tests/fixtures/arenas.ts the brawler's single-screen arenas: static worlds for physics and combat tests
tests/*.test.ts          levels (course validation), interp, protocol, controls
```

## Architecture rules

- **The server owns the sim.** Physics, damage, items, bots and phase
  transitions all live in `server/src/sim/`. The client never simulates. It
  sends input + one-shot actions, interpolates snapshots (`INTERP_DELAY_MS` in
  `interp.ts`), and plays `fx` events. Keep gameplay logic out of the client.
- **One global `Game` per server process.** No rooms. Capacity is 16 (humans
  bump bots when full).
- **Phases:** `lobby → starting → playing → ended → lobby`. Players are lined
  up on the start pad at `starting` (frozen during the countdown). `restart()`
  jumps straight to `starting`. Mid-round joiners have `life: 'waiting'`.
- **Life states:** `alive` (on the course), `respawning`, `out` (no lives),
  `waiting`. Only `alive` players are simulated, hit or rendered. A runner who
  has finished stays `alive` with `finishMs >= 0`: they can still move, but
  can't be shoved, shoot, or lose a life. Use `isRacing(p)` for "still in the
  race".
- **The screen is server state.** `World.scrollX` is the left edge of the
  1280 px screen. Only `updateScroll()` moves it, and only to the right. The
  right edge and the standing gate are walls (`clampToView` in `physics.ts`);
  being fully left of it, or below the screen, costs a life (`lostHow` in
  `game.ts`). Anything that used to assume a 0..1280 world (projectile culls,
  crate spawns, fx clamps) must be relative to `scrollX`.
- **Boxes are `Plat`s with a `box` field**, appended after the level's
  platforms (`World.solids` lists their indices). That is why landing, riding
  and crates work on them for free; only side and underside collision is
  extra. `hp: Infinity` is a permanent block. Never put `Infinity` in a
  snapshot (it isn't JSON): only damaged boxes are sent. A box with
  `arms: true` is a blue weapon box: `breakBox()` calls `armEveryone()`
  (`sim/items.ts`), which gives every racing runner the same weapon and
  pushes an `arms` fx.
- **Gates** are not entities: `World.gateIdx` is the next standing gate in
  `level.gates`, with one pooled `gateHp`. Everyone is always left of it.
- **Fixed timestep, sim time only.** `Game.step(dt)` runs whole `TICK_MS`
  ticks. Game logic uses `World.t` and `World.rng`, never `Date.now()`,
  `performance.now()` or `Math.random()`. The tests and bot fairness depend on
  determinism for a given seed.
- **Tuning goes in `shared/src/constants.ts`** (`PHYS`, `COMBAT`, `RUN`, `BOX`,
  `MATCH`, `ITEMS`). Don't hardcode gameplay numbers in sim code. (The client hardcodes
  the 1280x720 canvas in a few places; `ARENA` has the same numbers.)
- **Per-player state:** a new `Player` field (in `sim/model.ts`) must be set in
  `createPlayer()` and reset in `resetBody()` (per life) or `resetForRound()`
  (per round). If clients need it, add it to `PlayerState` (`shared/src/types.ts`)
  and to `Game.snapshot()`.
- **Hits go through `applyHit()`** (`sim/combat.ts`). It handles invulnerability,
  shields, the shove (constant strength: `RUN.shovePct`), damage percent
  (`RUN.dmg`: it only slows the runner, see `updatePace()` in `physics.ts`,
  which also slows whoever leads the pack), hitstun, credit and
  the `hit` fx. A new attack kind needs a `HitHow` entry and a label in
  `client/src/view/hud.ts`, and a `BOX.dmg` entry for what it does to boxes.
- **Lost lives** happen only in `Game.knockOut()`; **finishing** only in
  `Game.finish()`; the round ends only in `checkMatchEnd()` / `endMatch()`.
- **Effects:** sim code pushes `Fx` events into `World.fx`; `snapshot()` drains
  them. To add one: extend the `Fx` union, push it, and handle it in
  `ArenaScene.handleFx()` (particles + `play()` sound).
- **Courses** are written with the `Course` builder in `shared/src/courses.ts`
  and must pass `tests/levels.test.ts` (start pad, pit widths vs jump reach,
  boxes on solid ground, gates on firm floor with a respawn spot in view,
  respawn spots at most a screen apart). `platforms[0]` is the start pad.
  After editing one, run `npx tsx scripts/bot-run.ts 4 3 <id>`: bots must
  still finish. A new theme needs a `Theme` in `client/src/art/themes.ts`.
- **The client never receives the course.** It has the same level data, moves
  platforms with `platformPos(def, simTime)`, and `LevelView` only keeps
  sprites for pieces near the screen. `snapshot.round` bumps on every (re)start
  so the client rebuilds even on the same course.

## Adding a client → server message (checklist)

Skipping a step makes the message drop silently:

1. `shared/src/protocol.ts`: add the variant to `ClientMessage` **and** accept it
   in `isClientMessage()` (no-arg messages go in the `NO_ARGS` set).
2. `server/src/index.ts`: dispatch it in `handle()`.
3. `server/src/sim/game.ts`: add the `Game` method, guarded on phase / life.
4. Client: send it with `store.client?.send({ type: ... })`. In a run, wire
   it in `ArenaScene.handleInput()`. Every gameplay action needs a keyboard key
   **and** a touch button (`index.html` + `controls.ts` + `styles.css`).
5. Add a case to `tests/protocol.test.ts`.

Adding server → client data: update `SnapshotBody` / the types in
`shared/src/types.ts` and `Game.snapshot()`. `index.ts` forwards the whole
body (it splices `selfId` into the JSON string).

## Conventions

- **Import extensions differ by side:**
  - `server/` and `shared/` use `NodeNext` resolution and **must** import with a
    `.js` suffix (`'./game.js'`, `'../../../shared/src/levels.js'`).
  - `client/` uses bundler resolution and imports without extensions.
  - `shared/` is compiled by both configs: keep it dependency-free and use `.js`
    suffixes.
- TypeScript `strict`. `noUnusedLocals` is on for the client config.
- Style (no linter/formatter is configured, so match what's there): 2-space
  indent, single quotes, semicolons, JSDoc `/** */` on non-obvious members,
  section dividers like `// ---- input`.
- Client modules imported by tests (`controls.ts`, `interp.ts`, `net.ts`) must
  not touch `document`/`window` at import time. Tests run in node.
- WebSocket URL: same origin as the page, except the Vite dev port 5174 → 8091.
  `?ws=` overrides it.
- The client is touch-first: landscape-only, forced 16:9 stage. On touch
  devices the HUD cards move to the top so the thumb buttons don't cover them.
  On small screens the Arena camera zooms/follows the player inside the
  scrolling screen. Anything screen-anchored belongs in the HUD scene, not the
  Arena (which scrolls and is zoomed); world scenery that must not scroll uses
  `setScrollFactor(0, …)`.
- Art and audio are fully procedural. No binary assets are checked in.
  Textures are baked in `BootScene` / lazily (runner sheets per color, course
  textures per level; platform textures are shared by size and kind).

## Testing

- Sim tests use `tests/sim/helpers.ts`: `newGame(levelId, seed)` (a static
  single-screen arena from `tests/fixtures/arenas.ts`: no scrolling, no
  finish), `newRun(levelId, seed)` (a real course), `newCustom(flatWorld({…}))`
  (a flat floor plus the boxes/gates one test needs), `startMatch(g)` (joins,
  forces a round, runs the countdown, disables crates), `run(g, ms)`,
  `runToEnd(g, maxMs)`, `place(g, id, cx, feetY)`, `park(g, id)`.
- Teleporting a grounded player: clear `grounded`/`platIdx` first (`place()`
  does), or the platform snap puts them back. `place()` can't put anyone past
  the right screen edge or the standing gate: move `g.w.scrollX` first, or use
  a short world (`flatWorld({ length: 1900 })` has its finish on screen).
- Results and per-round stats are wiped when the results screen ends
  (`MATCH.endHoldMs`): stop at `phase === 'ended'` (`runToEnd`) before
  asserting on them.
- Bot tests run every course with fixed seeds. If you change tuning, physics
  or a course, re-run them: most bots must still finish and both gates must
  come down.
- `scripts/*.mjs` are integration checks against a live server (not part of
  `npm test`).

## Commits (MANDATORY)

**You MUST commit early and often.** This is a requirement, not a suggestion.

- Commit after **every** logical unit of work: a new feature, a bug fix, a new
  or changed test, a refactor, a doc update. Do not pile several of these into
  one commit.
- Never finish a task with uncommitted changes. Before you report that you're
  done, `git status` must be clean (except for files that are ignored on purpose).
- A multi-step task is a series of commits, one per step. Don't save them all
  for the end.
- Every commit must leave the tree green: run `npm test && npm run typecheck`
  before each commit. If something is broken mid-task, fix it before you
  commit. Don't commit a broken state "to fix later."
- Stage files explicitly (`git add <paths>`). Never commit `node_modules/`,
  `dist/`, `client/dist/`, `.env`, or logs.

Use conventional commits with a scope: `feat(game): …`, `fix(server): …`,
`feat(client): …`, `feat(lobby): …`, `test: …`, `perf(server): …`, `docs: …`.
Keep each commit small and about one thing.

## Shared code

This game is one project in an npm workspace. Code it shares with the other games lives in
`../base` and is imported as `@tggame/base/...`; read `../base/README.md` before copying code
from another game or adding hooks to anything that runs per tick, frame or message.
