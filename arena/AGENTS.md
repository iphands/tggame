# AGENTS.md

Guidance for AI coding agents working in this repo. **Last Survivor Arena** is a
multiplayer 2D arena platformer: Phaser 3 client, Node + `ws` server, TypeScript
everywhere. The server is authoritative. Clients send input and render snapshots.

> The git root is the parent directory (`../`). This project lives in `arena/`,
> and every command below runs from here. `../demo/` is unrelated.

## Commands

```bash
npm install
npm run dev          # tsx watch server (:8090) + vite client (:5173, LAN-visible) via concurrently
npm test             # vitest run (tests/**/*.test.ts), ~1s, no server needed
npm run typecheck    # client tsconfig + server tsconfig (both must pass)
npm run build        # tsc server -> dist/, vite client -> client/dist/
npm start            # node dist/server/src/index.js; serves client/dist + WS on :8090
node scripts/smoke.mjs [ws://host:port]        # protocol smoke test against a running server
node scripts/round-smoke.mjs [ws://host:port]  # plays a full bot round to results
```

Before you call a change done, run `npm test && npm run typecheck`. Both pass on
`main`.

Env vars: `PORT` (default 8090) and `STATIC_DIR` (default `client/dist`).

## Layout

```
shared/src/constants.ts  ALL tuning: TICK_HZ/TICK_MS, ARENA (blast zones), PHYS, COMBAT, MATCH, ITEMS, COLORS, BOT_NAMES
shared/src/levels.ts     LEVELS (5 arenas: platforms w/ kind + motion, spawns, theme, gravityScale), platformPos()
shared/src/types.ts      snapshot entity types (PlayerState, PlatformState, Fx, FeedEntry, ResultRow…)
shared/src/protocol.ts   ClientMessage / ServerMessage / SnapshotBody + isClientMessage()
server/src/index.ts      HTTP static + /health, WebSocket dispatch, message budget, 60 Hz loop, 30 Hz broadcast
server/src/sim/game.ts   Game: roster/bots, phases, stocks/KOs/respawn, results, snapshot()
server/src/sim/model.ts  internal Player/Plat/Projectile/Crate/World types + reset helpers
server/src/sim/physics.ts   applyInput, stepPlayer (gravity, jumps, ice, bounce, landing), tryDrop, separateBodies
server/src/sim/combat.ts    applyHit/knockback, stomp, fire (pistol/boomstick/bombs), projectiles, explode
server/src/sim/items.ts     crate spawn timer, falling/riding, pickup, grantItem
server/src/sim/platforms.ts buildPlats, updatePlats (motion + crumble), findLanding
server/src/sim/bots.ts      thinkBot: targeting, edge safety, gap jumps, recovery, attacks
server/src/sim/rng.ts       seedable PRNG (all sim randomness goes through World.rng)
client/src/main.ts       bootstrap (Phaser config, join flow, touch + audio unlock)
client/src/net.ts        GameClient (reconnect, input de-dupe) + defaultWsUrl() (same-origin; 5173 → 8090)
client/src/interp.ts     SnapshotBuffer: server-clock sync + interpolation (pure, unit-tested)
client/src/store.ts      shared client state; onSnapshot() feeds buffer + fx queue
client/src/lobby.ts      DOM overlay: join/lobby/game screens, roster, arena picker, buttons
client/src/controls.ts   touch buttons → touchInput / fireHeld / requests (DOM-free at import)
client/src/audio.ts      WebAudio synthesized sfx (play('hit') etc.), mute persisted
client/src/art/          color helpers, sprites.ts (fighter sheets, items, fx textures), themes.ts (backdrops, layers, platforms)
client/src/view/         LevelView, FighterView, Hud, Particles
client/src/scenes/       Boot (bake textures) → Lobby (live arena preview) → Arena (render + input + fx + camera)
                         HudScene: HUD overlay launched by Arena (unzoomed); shares `view` (visible world rect)
client/src/fullscreen.ts Fullscreen API / standalone detection; manifest in client/public/
scripts/make-icons.mjs   generates client/public/icons/*.png (gitignored) before dev/build
tests/sim/               sim tests (helpers.ts: newGame/startMatch/run/place/park)
tests/*.test.ts          levels, interp, protocol, controls
```

## Architecture rules

- **The server owns the sim.** Physics, damage, items, bots and phase
  transitions all live in `server/src/sim/`. The client never simulates. It
  sends input + one-shot actions, interpolates snapshots (`INTERP_DELAY_MS` in
  `interp.ts`), and plays `fx` events. Keep gameplay logic out of the client.
- **One global `Game` per server process.** No rooms. Capacity is 16 (humans
  bump bots when full).
- **Phases:** `lobby → starting → playing → ended → lobby`. Players are placed
  on the arena at `starting` (frozen during the countdown). `restart()` jumps
  straight to `starting`. Mid-round joiners have `life: 'waiting'`.
- **Life states:** `alive` (on stage), `respawning`, `out` (no stocks),
  `waiting`. Only `alive` players are simulated, hit or rendered.
- **Fixed timestep, sim time only.** `Game.step(dt)` runs whole `TICK_MS`
  ticks. Game logic uses `World.t` and `World.rng`, never `Date.now()`,
  `performance.now()` or `Math.random()`. The tests and bot fairness depend on
  determinism for a given seed.
- **Tuning goes in `shared/src/constants.ts`** (`PHYS`, `COMBAT`, `MATCH`,
  `ITEMS`). Don't hardcode gameplay numbers in sim code. (The client hardcodes
  the 1280x720 canvas in a few places; `ARENA` has the same numbers.)
- **Per-player state:** a new `Player` field (in `sim/model.ts`) must be set in
  `createPlayer()` and reset in `resetBody()` (per life) or `resetForRound()`
  (per round). If clients need it, add it to `PlayerState` (`shared/src/types.ts`)
  and to `Game.snapshot()`.
- **Hits go through `applyHit()`** (`sim/combat.ts`). It handles invulnerability,
  shields, damage %, knockback, hitstun, KO credit and the `hit` fx. A new
  attack kind needs a `HitHow` entry and a label in `client/src/view/hud.ts`.
- **KOs** happen only in `Game.knockOut()` (blast zones are in `ARENA`).
- **Effects:** sim code pushes `Fx` events into `World.fx`; `snapshot()` drains
  them. To add one: extend the `Fx` union, push it, and handle it in
  `ArenaScene.handleFx()` (particles + `play()` sound).
- **Levels** are pure data in `shared/src/levels.ts`. `tests/levels.test.ts`
  checks that spawns sit on static platforms and that motion stays on screen.
  A new theme needs a `Theme` in `client/src/art/themes.ts`.

## Adding a client → server message (checklist)

Skipping a step makes the message drop silently:

1. `shared/src/protocol.ts`: add the variant to `ClientMessage` **and** accept it
   in `isClientMessage()` (no-arg messages go in the `NO_ARGS` set).
2. `server/src/index.ts`: dispatch it in `handle()`.
3. `server/src/sim/game.ts`: add the `Game` method, guarded on phase / life.
4. Client: send it with `store.client?.send({ type: ... })`. In the arena, wire
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
- WebSocket URL: same origin as the page, except the Vite dev port 5173 → 8090.
  `?ws=` overrides it.
- The client is touch-first: landscape-only, forced 16:9 stage. On touch
  devices the HUD cards move to the top so the thumb buttons don't cover them.
  On small screens the Arena camera zooms/follows the player. Anything
  screen-anchored belongs in the HUD scene, not the Arena (which is zoomed).
- Art and audio are fully procedural. No binary assets are checked in.
  Textures are baked in `BootScene` / lazily (fighter sheets per color, arena
  textures per level).

## Testing

- Sim tests use `tests/sim/helpers.ts`: `newGame(levelId, seed)`,
  `startMatch(g)` (joins, forces a round, runs the countdown, disables crates),
  `run(g, ms)`, `place(g, id, cx, feetY)`, `park(g, id)`.
- Teleporting a grounded player: clear `grounded`/`platIdx` first (`place()`
  does), or the platform snap puts them back.
- Bot tests run whole matches with fixed seeds. If you change tuning, re-run
  them, and check that matches still finish and bots rarely fall on their own.
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
