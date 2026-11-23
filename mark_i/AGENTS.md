# AGENTS.md

Guidance for AI coding agents working in this repo. **Last Survivor Arena** is a
multiplayer 2D arena platformer: Phaser 3 client, Node + `ws` server, TypeScript
everywhere. The server is authoritative. Clients send input and render snapshots.

> The git root is the parent directory (`../`). This project lives in `mark_i/`,
> and every command below runs from here. `../demo/` is unrelated.

## Commands

```bash
npm install
npm run dev          # tsx watch server (:8080) + vite client (:5173) via concurrently
npm test             # vitest run (tests/**/*.test.ts), fast, no server needed
npm run typecheck    # client tsconfig + server tsconfig (both must pass)
npm run build        # tsc server -> dist/, vite client -> client/dist/
npm start            # node dist/server/src/index.js; serves client/dist + WS on :8080
node scripts/smoke.mjs        # WS smoke test; needs a server running on :8080
node scripts/round-smoke.mjs  # end-to-end lobby -> playing check; needs a server running
```

Before you call a change done, run `npm test && npm run typecheck`. Both pass on
`main` (38 tests).

Env vars: `PORT` (default 8080) and `STATIC_DIR` (default `client/dist`).

## Layout

```
shared/src/protocol.ts   wire types (ClientMessage / ServerMessage) + isClientMessage guard
shared/src/constants.ts  WORLD tuning (physics, combat, match timing), TICK_HZ=60, SNAP_HZ=30, colors
server/src/game.ts       Game class: the whole simulation (phases, physics, stomp, push, bullets, drop)
server/src/level.ts      PLATFORMS (one-way, some moving) + SPAWNS
server/src/index.ts      HTTP static server + /health + WebSocket dispatch + 60 Hz loop / 30 Hz snapshots
client/src/main.ts       Phaser bootstrap, join flow, global DOM button wiring
client/src/net.ts        GameClient: WS wrapper, auto-reconnect w/ backoff, typed send helpers
client/src/store.ts      mutable singleton shared by net, scenes and DOM overlay; roster rendering
client/src/controls.ts   touch buttons, keyboard+touch merge, fire/drop flags (DOM-free at import)
client/src/ui.ts         DOM overlay show/hide helpers
client/src/art.ts        procedural canvas textures (no image assets)
client/src/scenes/       Boot (bake textures) -> Lobby -> Arena (interpolated render + input send)
client/index.html, styles.css   DOM overlay: name form, roster, restart/GO buttons, touch bar, rotate gate
tests/                   vitest suites; most drive `new Game()` directly
```

## Architecture rules

- **The server owns the sim.** All physics, damage, and phase transitions live in
  `server/src/game.ts`. The client never predicts or simulates. It sends input,
  buffers snapshots, and interpolates (`INTERPOLATION_MS = 110` in `ArenaScene`).
  Keep gameplay logic out of the client.
- **There is one global `Game` per server process.** No rooms.
- **Phases:** `lobby -> starting (countdown) -> playing -> ended (endHoldMs) -> lobby`.
  `restart()` force-skips straight to `starting`. Players who join mid-round are
  `waiting` (spectators) until the next `startMatch()`.
- **Game time is sim time.** Use `this._simTimeMs` and the `dtMs` passed to
  `step()`. Never use `Date.now()` / `performance.now()` for game logic inside
  `Game`, because the tests depend on determinism by stepping manually. (The only
  wall-clock use is player ID generation in `nextPlayerId()`.)
- **Tuning goes in `WORLD`** (`shared/src/constants.ts`). Don't hardcode magic
  physics numbers in `game.ts`. (Exception: the client hardcodes the 1280x720
  canvas in `main.ts`, `BootScene`, and `ArenaScene`. If you change world size,
  update them too.)
- **Per-player state lives in three places.** When you add a field to the
  `Player` type, initialize it in `join()` and reset it in both `startMatch()`
  and `resetToLobby()`. If clients need it, also add it to `PlayerSnapshot` and
  `snapshot()`.
- **Elimination:** set `alive = false` and `platIdx = -1`, then call
  `emitEvent(p, cause)`. A new cause must also be added to the `Cause` union.

## Adding a client -> server message (checklist)

Message handling is spread across 5 places. Skipping one makes the message drop
silently:

1. `shared/src/protocol.ts`: add the variant to `ClientMessage`, **and** accept
   it in `isClientMessage()`. Unrecognized messages are ignored with no error.
2. `server/src/index.ts`: dispatch it in the `ws.on('message')` handler.
3. `server/src/game.ts`: add the `Game` method. Guard on `alive`, `waiting`, and
   `phase`, the way `shoot()` / `drop()` do.
4. `client/src/net.ts`: add a `sendXxx()` helper on `GameClient`.
5. Wire the input in `ArenaScene.update()` / `controls.ts` (keyboard **and** a
   touch button in `index.html` + `styles.css`).

Adding server -> client data means updating `ServerMessage` /
`PlayerSnapshot` / etc., `Game.snapshot()`, and the explicit field copy in
the loop in `server/src/index.ts`. Fields are copied one by one, not spread.

## Conventions

- **Import extensions differ by side:**
  - `server/` and `shared/` use `NodeNext` resolution and **must** import with a
    `.js` suffix (`'./game.js'`, `'../../shared/src/protocol.js'`).
  - `client/` uses bundler resolution and imports without extensions.
  - `shared/` code is compiled by both configs, so keep it dependency-free and
    use `.js` suffixes there.
- TypeScript `strict`. `noUnusedLocals` is on for the client config.
- Style (no linter/formatter is configured, so match what's there): 2-space
  indent, single quotes, semicolons, JSDoc `/** */` on
  non-obvious members, section-divider comments like `// ---- input`.
- Client modules imported by tests (e.g. `controls.ts`) must not touch
  `document`/`window` at import time. Tests run in vitest's node environment.
- The client always connects its WebSocket to **port 8080 on the page's host**
  (`net.ts defaultWsUrl`). There's no Vite proxy, so dev needs both processes
  running.
- The client targets touch and phones first: landscape-only with a forced 16:9
  stage. Every gameplay action needs a touch control as well as a keyboard binding.
- Art is procedural (`art.ts`) and no binary assets are checked in. Textures
  are baked in `BootScene`.

## Testing

- Unit tests build a `Game`, call `join()`, and step until `phase === 'playing'`
  (see `reachPlaying()` in `tests/game.test.ts`). Then they set positions/inputs
  directly on `game.players.get(id)!` and call `game.step(1000/60)`.
- Add a focused test file per feature (`jump`, `gun`, `drop`, `restart` already
  exist). Cover lifecycle edge cases such as restart and auto-start re-arm,
  because those have regressed before.
- `scripts/*.mjs` are manual integration checks against a live server. They are
  not part of `npm test`.

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

## Known stale docs

`README.md` lags the code. Its protocol section omits `restart`/`shoot`/`drop`
and bullets, and its controls section omits fire (F / click / FIRE), drop
(↓ / S / ▼), restart (R), the variable-height jump, HP, and stomps. Treat the
source as the truth, and update the README when you touch these areas.
