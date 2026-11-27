# Doodle Telephone

The telephone game with doodles, for 3 to 12 players on their own phones or laptops.
Pick a secret word, draw it, pass it on. The next player sees **only your drawing** and
writes what they think it is; the next sees **only that guess** and draws it; and so on:

**word → drawing → word → drawing → word**

Then everybody watches each sketchbook unravel, page by page.

## Quick start

```sh
npm install
npm run dev        # game server on :8092, client on :5175
```

Open `http://localhost:5175` (or `http://<your-LAN-ip>:5175` from a phone on the same Wi-Fi).
Playing alone? Add Doodlebots in the lobby.

| Command | What it does |
|---|---|
| `npm run dev` | server (`tsx watch`) + Vite client with hot reload |
| `npm run build && npm start` | production: one Node process serves client and WebSocket on `PORT` (default 8092) |
| `npm test` | unit tests (rules, hidden information, drawing validation, protocol) |
| `npm run typecheck` | client and server type checks |
| `node scripts/smoke.mjs [ws://host:port]` | plays whole games over real sockets against a running server with an empty lobby |

Environment: `PORT` (8092), `STATIC_DIR` (`client/dist`). The client connects to the page's own
origin; `?ws=ws://host:port` overrides it.

## How a game goes

1. **Lobby.** Everyone who opens the page lands at the same table (one game per server). The first
   player is the host: they add or remove Doodlebots and start the game.
   The host also picks the **passing order**: *Fixed order* (seats as people joined, you always
   pass to the same player), *Shuffle per round* (the default: seats are reshuffled every game) or
   *Shuffle every turn* (books hop around, so you get pages from a different player each turn).
2. **Pick.** Each player is dealt four words and secretly picks one, or writes a word or phrase of their own.
3. **Draw / guess turns.** Everyone works at once, then all sketchbooks pass to the next player.
   You only ever see the single page before yours. There is no timer: a turn ends when everyone has
   handed in. You can reopen your page until then.
   - You always draw the word you picked, then pass the book on. Every book ends on a guess, so
     with an odd number of players each book stops one player short of a full lap.
   - Someone stuck or gone? The host can **Skip** them (they hand in a blank page).
   - Done and bored? **Heckle** whoever is still busy, as often as you like. Everyone sees it, and
     the more one player gets, the louder it becomes (their phone buzzes and their screen shakes).
4. **Reveal.** One book at a time; its owner (or the host) flips the pages. Drawings replay stroke by
   stroke. Tap ♥ on pages you love. Each book ends with a verdict: *It survived!* or *Lost in translation*.
5. **Finale.** Awards from the hearts (Best Doodle, Best Guess, Crowd Favourite), every book to
   re-read and save as a PNG, then play again.

Drawing tools: ten marker colours, three nib sizes, fill bucket, eraser, undo/redo (also Ctrl+Z / Ctrl+Shift+Z),
clear. No letters or numbers: honour system!

Good to know:

- **Reconnecting.** Your seat is remembered in the browser. Reload, lock your phone, lose Wi-Fi: you
  come back to the same seat and the same page, with your unfinished drawing intact.
- **Joining late.** You watch the current game and are dealt in for the next one.
- **Abandoned games.** If every human is gone for 90 seconds the table is cleared.

## How it is built

```
shared/src/   rules shared by both sides: rotation, drawing validation, protocol, words, awards
server/src/   index.ts (HTTP + WebSocket, per-player sync)  game.ts (pure state machine)  bots.ts
client/       index.html, styles.css, src/ (vanilla TypeScript, DOM + 2D canvas, no framework)
tests/        vitest unit tests        scripts/  icon generator, smoke test
```

- **Server-authoritative and private by construction.** `Game` never hands out a book. Each socket
  gets a `state` (public: phase, who has handed in, hearts), its own `task` (the one page in front of
  that player), and `pages` only as they are revealed. `tests/views.test.ts` checks that nothing else leaks.
- **Drawings are vectors**: strokes of `{ c: colour index, w: width, p: [x, y, …] }` on a 1000 × 750
  page. Small on the wire, sharp at any size, and replayable. The server validates and caps every drawing.
- **No assets in git.** Icons are generated (`scripts/make-icons.mjs`), sounds are synthesized, fonts
  come from npm (`@fontsource`), so it works offline on a LAN.

### Protocol

| Client → server | |
|---|---|
| `join {name?, token?}` | sit down, or reclaim a seat with its token |
| `addBot` `removeBot` `start` | host, in the lobby |
| `pick {index}` `write {text}` `draw {strokes}` `guess {text}` | hand in this turn's page (`write`: your own starting word) |
| `skip {playerId}` | host: blank page for a stalled player |
| `settings {order}` | host, in the lobby: `fixed`, `round` (default) or `turn`; shows as `state.settings` |
| `heckle {playerId}` | a player who has handed in shouts at one who has not; arrives as `state.heckle` |
| `next` | reveal: flip (book owner or host) |
| `heart {book, page}` | toggle a heart on a revealed page |
| `again` `abort` | host: back to the lobby (after the finale / any time) |
| `leave` | give up the seat |

| Server → client | |
|---|---|
| `welcome {selfId, token}` | your id and seat token |
| `full` | no room |
| `state {state}` | public game state, tailored with `selfId`, `submitted`, `myHearts` |
| `task {task}` | your current job: a word card, a word to draw, or a drawing to guess |
| `pages {game, pages}` | newly revealed pages |
