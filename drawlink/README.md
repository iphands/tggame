# Drawlink

A live draw-and-guess party game for 3 to 16 players on their own phones or laptops.
One player gets a secret word and draws it; everyone else watches the drawing appear stroke by
stroke and types guesses. The **first right guess** scores, and so does the drawer, and the
faster it happens the more it is worth.

## Quick start

```sh
npm install
npm run dev        # game server on :8089, client on :5176
```

Open `http://localhost:5176` (or `http://<your-LAN-ip>:5176` from a phone on the same Wi-Fi).
Playing alone? Add Guessbots in the lobby.

| Command | What it does |
|---|---|
| `npm run dev` | server (`tsx watch`) + Vite client with hot reload |
| `npm run build && npm start` | production: one Node process serves client and WebSocket on `PORT` (default 8089) |
| `npm test` | unit tests (rules, scoring, hints, hidden word, protocol) |
| `npm run typecheck` | client and server type checks |
| `node scripts/smoke.mjs [ws://host:port]` | plays a short game over real sockets against a running server with an empty lobby |

Environment: `PORT` (8089), `STATIC_DIR` (`client/dist`). The client connects to the page's own
origin; `?ws=ws://host:port` overrides it.

## How a game goes

1. **Lobby.** Everyone who opens the page lands at the same table (one game per server). The first
   player is the host: they add or remove Guessbots, pick the number of rounds (5, 10, 15 or 20)
   and whether letter hints are on, and start the game.
2. **A round.** The pen goes round the table in seating order. The drawer is shown a word; nobody
   else is. Guessers type into the chat. Guessing and drawing happen at the same time.
   - **Scoring.** A round opens at 120 points and loses 10 every 10 seconds. The first correct
     guesser and the drawer each get whatever it is worth at that moment. Nobody else scores.
   - **Time's up** after two minutes: nobody scores, and the next round starts.
   - **Letter hints** (if on): after 20 s a blank for every letter, then the first letter at 40 s,
     the last at 60 s, the second at 80 s and the second-to-last at 100 s. Never more than half the word.
   - **Pass.** The drawer can give a word up; the next player gets a new one and the round number
     does not move.
   - Guesses forgive case, spacing, punctuation, a leading "the/a/an" and a plural "s".
3. **Between rounds** the answer and the drawing stay up for a few seconds.
4. **Final scores** after the last round; equal scores share a place. The host deals again.

Drawing tools: ten marker colours, three nib sizes, fill bucket, eraser, undo/redo (also Ctrl+Z / Ctrl+Shift+Z),
clear. No letters or numbers: honour system! (The drawer cannot *type* the answer, though.)

Around the table:

- **Chat** is the guess box. Tap a player to **whisper**: only the two of you see it.
- **Vote out.** Tap a player to vote them off the table. More than half of the seated humans who
  are connected carries it. Their seat token is refused until the table empties. This is a
  party-game safeguard, not security: a cleared browser gets a new identity.
- **Joining late.** You sit straight down with zero points and join the drawing order. At a full
  table (16) you watch and chat until a seat frees up.
- **Reconnecting.** Your seat is remembered in the browser. Reload, lock your phone, lose Wi-Fi: you
  come back to the same seat and score. A drawer who is gone for 12 seconds passes automatically.
- **Guessbots** never draw. They blurt wrong guesses and now and then get one right.
- **Abandoned games.** If every human is gone for 90 seconds the table is cleared.

## How it is built

```
shared/src/   rules shared by both sides: scoring and hints, ink validation, protocol, words
server/src/   index.ts (HTTP + WebSocket, per-player sync, the clock)  game.ts (pure state machine)  bots.ts
client/       index.html, styles.css, src/ (vanilla TypeScript, DOM + 2D canvas, no framework)
tests/        vitest unit tests        scripts/  icon generator, smoke test
```

- **Server-authoritative.** The word lives in `Game` and leaves it only as the drawer's `task` and,
  once the round is over, as its `result`. Guessers get the drawing, the chat and the timed hint.
  `tests/views.test.ts` checks that nothing else leaks.
- **Live ink.** Drawings are vector strokes of `{ c: colour index, w: width, p: [x, y, …] }` on a
  1000 × 750 page. The drawer streams points in small batches as they draw; the server validates,
  stores and relays them. Anyone arriving mid-turn (or a drawer who got out of step) is sent the
  whole canvas.
- **Bucket fills** are one-point strokes with `f: 1`. Every client works the flood out on a copy of
  the page at one pixel per page unit (`client/src/fill.ts`) and stamps the result at its own
  scale, so a fill covers the same area on a phone as on a monitor.
- **The server keeps time.** `Game` has no clock: every action and a 4 Hz tick pass in `now`.
  Clients learn the server's clock on `welcome` and run the countdown locally from `startedAt`.
- **No assets in git.** Icons are generated (`scripts/make-icons.mjs`), sounds are synthesized, fonts
  come from npm (`@fontsource`), so it works offline on a LAN.

Every number above (points, step, hint times, pause, seats) is a constant in `shared/src/constants.ts`.

### Protocol

| Client → server | |
|---|---|
| `join {name?, token?}` | sit down, or reclaim a seat with its token |
| `addBot` `removeBot` `settings {rounds?, hints?}` `start` | host, in the lobby |
| `ink {i, c, w, p, f?}` | drawer: append points to stroke `i` (the last stroke, or a new one); `f: 1` = a bucket fill |
| `undo` `clear` `pass` | drawer |
| `chat {text, to?}` | a guess or a chat line; with `to`, a whisper |
| `boot {playerId}` | toggle a vote to remove a player |
| `again` `abort` | host: back to the lobby (after the finale / any time) |
| `leave` | give up the seat |

| Server → client | |
|---|---|
| `welcome {selfId, token, now}` | your id, seat token, and the server clock |
| `full` `booted` | no room / voted out |
| `state {state}` | public game state, tailored with `selfId` and `myBoots` |
| `task {task}` | the word, for the drawer only |
| `canvas {turn, strokes}` | the whole page of a turn |
| `ink {turn, i, c, w, p}` `undo {turn}` `clear {turn}` | changes to it (never echoed to the drawer) |
| `chat {lines}` | new chat lines this player may read |
