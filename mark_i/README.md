# ⚔️ Last Survivor Arena

A multiplayer 2D arena platformer. Everyone lands on a hand-crafted set of
floating islands. Shove, stomp, and shoot each other off, and the last player
standing wins.

Built with **Phaser 3 + TypeScript** on the client and a **Node + TypeScript
server-authoritative** world simulation over WebSockets. The client is built
for phones first (landscape, on-screen controls) and also supports keyboard
and mouse.

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. Type your name and hit **Join arena**.

- `npm run dev` runs the game server on **:8080** (`tsx watch`) and the Vite
  client on **:5173**. The client always opens its WebSocket to port **8080**
  on the same host it was loaded from.
- `npm run build && npm start` builds the server and client, then serves
  both from one Node process on port **8080**. Use this setup for LAN play:
  open `http://<your-lan-ip>:8080` on each device. (The Vite dev server only
  listens on localhost.)
- `npm test` runs the vitest suites (lifecycle, physics, push, stomp, pistol,
  jump, drop-through, restart, input merge).
- `npm run typecheck` checks both the client and server TypeScript configs.

## How to play

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `←` `→` or `A` `D` | ◀ ▶ |
| Jump | `Space`, `W` or `↑` | JUMP |
| Drop through a platform | `↓` or `S` | ▼ |
| Fire pistol | `F` (hold) or click the canvas | FIRE |
| Force restart (in the arena) | `R` or the **↻ Restart** button | ↻ Restart |
| Force start (in the lobby) | `Enter` or the **▶ GO** button | ▶ GO |

- **Jump:** tap for a short hop, hold for a high jump. Holding jump while
  falling slows your descent. Coyote time and input buffering make jumps
  forgiving.
- **Drop-through:** platforms are one-way. You can only drop through one
  while standing on it and when another platform is below you, never
  straight into the pit.
- **Push:** when two players touch, both get shoved apart.
- **Head stomp:** landing on someone's head bounces you high, shoves them
  away, and deals **15** damage.
- **Pistol:** fires a horizontal bullet in the direction you're facing. Each
  hit deals **50** damage, so two hits kill. It has a short cooldown, shown by
  the bar under the timer.
- Every player has **100 HP**. You're eliminated by falling into the pit or
  by dropping to 0 HP. The kill feed at bottom-left shows who fell off, was
  stomped, was shot, or left.

### Match flow

- The arena holds up to **16** players.
- **Lobby:** a match starts on its own **10 s** after there are 2 or more
  players, or right away once **10** have joined. Anyone can skip the wait
  with **▶ GO** / `Enter`. That works even solo, as a sandbox.
- **Countdown:** 3 seconds, then players spawn at fixed points spread across
  the islands.
- **Match:** lasts up to **3:00**. It ends as soon as only one player is
  alive, and that player wins. If time runs out with more than one player
  alive, the round is a draw ("TIME'S UP").
- **End:** the winner banner stays for 8 s, then everyone goes back to the
  lobby for the next round. **↻ Restart** skips the wait.
- Players who join mid-round watch the current round and play in the next one.

All of these numbers are set in `WORLD` in `shared/src/constants.ts`.

## Architecture

```
shared/src/protocol.ts    wire message types + isClientMessage() guard
shared/src/constants.ts   game tuning (physics, HP, pistol, match timing, colors), TICK_HZ, SNAP_HZ
server/src/level.ts       hand-crafted platforms (two of them move) + spawn points
server/src/game.ts        authoritative sim: phases, physics, one-way platforms, drop-through,
                          push, stomp, bullets, elimination, win/draw
server/src/index.ts       HTTP (static client + /health) and WebSocket entrypoint, game loop
client/src/main.ts        Phaser bootstrap, join flow, restart/GO button wiring
client/src/net.ts         WebSocket client (auto-reconnect with backoff, typed senders)
client/src/store.ts       shared mutable state between the net client, scenes and DOM overlay
client/src/controls.ts    touch controls, keyboard+touch input merge, fire/drop flags
client/src/ui.ts          DOM overlay helpers
client/src/art.ts         procedurally drawn pixel-art-style textures
client/src/scenes/        Boot → Lobby → Arena Phaser scenes
client/index.html         DOM overlay: name form, roster, buttons, touch bar, rotate-device gate
tests/*.test.ts           vitest suites (game, jump, gun, drop, restart, controls)
scripts/smoke.mjs         WebSocket smoke test (join/roster/disconnect)
scripts/round-smoke.mjs   end-to-end check that two clients reach the playing phase
```

### Game loop (server, authoritative)

The server runs the simulation at **60 Hz** and broadcasts a `snapshot` to
every client at **30 Hz**. Clients never simulate physics. They send their
input and render the snapshots, interpolated about 110 ms behind for
smoothness.

### Protocol (one JSON message per WebSocket frame)

Client → server:

| Message | Payload | Notes |
| --- | --- | --- |
| `join` | `name?` | Name is cleaned up and capped at 18 characters. A re-join replaces your old player. |
| `input` | `left`, `right`, `jump` (booleans) | Sent when your input changes, plus every 20 frames as a heartbeat. |
| `shoot` | — | Fire the pistol. The server enforces the cooldown. |
| `drop` | — | Drop through the current platform. Ignored if nothing is below. |
| `restart` | — | Force-restart: reset the round and start a new countdown. |
| `leave` | — | Leave the match. |

Server → client:

- `welcome`: `selfId`, `capacity`, `serverTimeMs`
- `snapshot`: `tick`, `phase` (`lobby` / `starting` / `playing` / `ended`),
  `selfId`, `countdownMs`, `timeLeftMs`, `winnerId`, `players`
  (position, velocity, `alive`, `waiting`, `hp`/`maxHp`, `lastShotAtMs`),
  `platforms`, `bullets`, `events` (recent eliminations, newest first),
  `simTimeMs`, `serverTimeMs`

## Deploying / sharing

In production (`npm run build && npm start`), the server serves the built
client from `client/dist` on the same port it uses for WebSockets, so a
single machine or VPS is all you need.

- `PORT`: the server port. Default `8080`. **Note:** the client always
  connects its WebSocket to port 8080, so changing `PORT` (or putting the
  game behind a proxy on a different port) also means changing
  `defaultWsUrl()` in `client/src/net.ts`.
- `STATIC_DIR`: where to find the built client. Default `client/dist`.
- `GET /health` returns `{ ok, phase, players }`.
- Caching is tuned for LAN play. `index.html` is never cached, and other
  files revalidate on every load (a cheap 304 when unchanged).

## Known notes

- **Art:** the pixel-art textures are drawn in code (`client/src/art.ts`) and
  baked into textures in `BootScene`. There are no image files. To use real
  art, add files under `client/public/` and load them in `BootScene`.
- **Mobile:** landscape only. Portrait shows a "rotate your device" screen,
  and the stage is locked to 16:9.
- **Scope:** one shared arena per server (no rooms). No chat, rankings,
  respawn, or gamepad support.

## License

MIT
