# ⚔️ Last Survivor Arena

A multiplayer 2D arena platformer. Everyone lands on a hand-crafted floating
island — push each other off the edge, and the last player standing wins.

Built with **Phaser 3 + TypeScript** on the client and a **Node + TypeScript
server-authoritative** world simulation over WebSockets.

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. Type your name and hit **Join arena**.

- Two or more players auto-start a match after a short waiting window
  (10–16 players start faster). The arena supports up to **16** players.
- `npm run build && npm start` builds the client and serves it from the Node
  server on port **8080** (one port, deploy-ready).
- `npm test` runs the sim unit tests (physics, push, elimination, win).
- `npm run typecheck` checks both client and server.

## How to play

- **Move:** `←`/`→` or `A`/`D`
- **Jump:** `Space` (or `W` / `↑`)
- Push your opponents off the islands — contact shoves both players.
- A match ends when only one player is left (or after 3:00 — a draw if more
  than one is alive). Winner banner, then back to the lobby for the next round.
- Players who join mid-round watch the current round and enter for the next one.

## Architecture

```
shared/src/protocol.ts    wire messages (join/input/leave → welcome/snapshot)
shared/src/constants.ts   game tuning (gravity, jump, push, timer, colors…)
server/src/level.ts       hand-crafted arena + spawn points
server/src/game.ts        authoritative sim: physics, one-way platforms, push, elimination, win
server/src/index.ts       WS/HTTP entrypoint (serves client/dist in prod)
client/src/net.ts         WebSocket client (auto-reconnect, latest-input send)
client/src/main.ts        Phaser bootstrap + join flow
client/src/store.ts       shared mutable state between client and scenes
client/src/art.ts         procedurally drawn pixel-art-style textures
client/src/scenes/        Boot → Lobby → Arena Phaser scenes
tests/game.test.ts        vitest tests for the simulation
scripts/smoke.mjs         WebSocket smoke test (join/roster/disconnect)
scripts/round-smoke.mjs   end-to-end start/playing check
```

### Game loop (server, authoritative)

`npm run dev:server` runs `tsx watch server/src/index.ts`. The server ticks at
60 Hz, simulates physics + player pushes, eliminates players below the pit,
and broadcasts a `snapshot` at 30 Hz. Clients render interpolated positions —
nither client computes its own physics.

### Protocol (one JSON message per frame)

Client → server: `join`, `input` (left/right/jump), `leave`
Server → client: `welcome` (selfId, capacity), `snapshot` (phase, tick,
countdown, timer, winner, players, platforms, events)

## Local sharing

Everything runs locally out of the box. For a public deploy, the server serves
the static client from the same port (one WebSocket + static origin), so a
single VPS works — just set `PORT` (and `STATIC_DIR` if you build the client
elsewhere).

## Known notes

- **Art:** the pixel-art textures are drawn procedurally in code
  (`client/src/art.ts`) because the image-generation service was unavailable
  in the session this was built. To swap in generated art: drop replacements
  in `client/public/assets/` and load them in `BootScene`.
- **Scope (v1):** no chat, no rankings, no respawn, no spectators beyond
  mid-round wait, no gamepad. Keyboard focus only.

## License

MIT
