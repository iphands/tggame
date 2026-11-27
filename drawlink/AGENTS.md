# AGENTS.md: Drawlink (`drawlink/`)

Live draw-and-guess party game, up to 16 players. Started as a copy of `tele/` and shares its
tooling, look and conventions, but no code. Read `README.md` for the rules and protocol.

## Commands

```sh
npm run dev         # server :8093 (tsx watch) + Vite :5176
npm test            # vitest, ~1 s, no server needed
npm run typecheck   # tsc for client+shared, then server+shared
npm run build       # tsc server → dist/, vite client → client/dist/
```

Before calling a change done: `npm test && npm run typecheck`.

**Do not test on 8093/5176.** Someone may be playing there, and there is one game per server.
Start a private pair instead, and stop them by PID (never `pkill` by name: the sibling games run
the same commands):

```sh
PORT=8193 npx tsx server/src/index.ts
npx vite --port 5199 --strictPort
# open http://localhost:5199/?ws=ws://localhost:8193
node scripts/smoke.mjs ws://localhost:8193    # needs an empty lobby
```

## Layout

| Path | Role |
|---|---|
| `shared/src/constants.ts` | every tunable number and palette |
| `shared/src/round.ts` | `awardAt` (points by elapsed time) and `hintAt` (letters by elapsed time) |
| `shared/src/drawing.ts` | stroke/name/chat sanitising, `sameWord`, `givesAway` |
| `shared/src/protocol.ts` | message unions + `isClientMessage` |
| `shared/src/types.ts` | `Stroke`, `StateView`, `ChatLine`, … |
| `server/src/game.ts` | the whole game as a pure state machine |
| `server/src/index.ts` | HTTP static server, WebSocket, `sync()`, the tick and abandon timers |
| `server/src/bots.ts` | Guessbot names and wrong guesses |
| `client/src/main.ts` | join flow, connection, message handling, header, screen switching |
| `client/src/screens/` | `lobby`, `play` (the whole game is one screen), `finale`; `index.ts` maps state → screen key |
| `client/src/pad.ts` | the shared page: pointer input → streamed strokes for the drawer, painting for everyone |
| `client/src/render.ts` `fill.ts` | stroke painting; bucket fills, flooded at a fixed resolution so every screen agrees |
| `client/src/chat.ts` `players.ts` | chat/guess box, player list with whisper and vote-out |
| `client/styles.css` | all styling |

## Rules that must hold

- **Hidden information.** While a round runs the word may leave `Game` only through `taskFor(drawer)`.
  `viewFor` carries it only as `result`, after the round. Chat lines the drawer writes are checked
  with `givesAway`. If you add a field to `StateView` or a chat kind, extend `tests/views.test.ts`.
- **The guess sent first wins, not the one that arrived first.** Each guesser's round trip
  (measured by the server, told to `Game.notePing`, capped at `GUESS_FAIR_CAP_MS`) is taken off
  their correct guess, which is then held in `settleGuess` until nobody on a slower line could
  still have been first; the award is for when it was sent. Never end a round on arrival order.
- **`Game` is pure.** No sockets, timers, `Date.now()` or bare `Math.random()` in `game.ts`; time
  comes in as `now` on every action and on `tick`, randomness from the injected RNG.
- **Never trust a client.** Ink goes through `sanitizeStroke` and the `DRAW_LIMITS`, strings through
  `sanitizeName` / `sanitizeChat`; host and drawer actions check authority inside `Game`.
- **Send on change.** `sync()` runs after every handled message and every tick, and resends a
  socket's state or task only when its JSON changed. Ink goes out as deltas tagged with the turn;
  a socket whose `canvasTurn` is stale gets the whole canvas instead. The drawer is never sent deltas.
- **`shared/` is dependency-free** and imported by both sides: server and shared files import with a
  `.js` suffix, client files without.
- **Screens are keyed.** `screenKey()` changing rebuilds the screen; the same key only calls
  `update()`. A game is one `play:<game>` key so the pad, the chat scroll and a half-typed guess
  survive every round.
- **No binary assets.** Art is CSS/SVG/canvas, sounds are WebAudio, icons are generated.

## Adding a client → server message

1. Add it to `ClientMessage` and `isClientMessage` in `shared/src/protocol.ts` (+ a case in `tests/protocol.test.ts`).
2. Add a method on `Game` that validates phase, seat and authority itself.
3. Dispatch it in `handle()` in `server/src/index.ts`.
4. Send it from the client with `send()` from `client/src/store.ts`.
5. Document it in the README protocol table.

## Conventions

TypeScript strict, 2-space indent, single quotes, semicolons, JSDoc on non-obvious members,
`// ---- section` dividers. Conventional commits scoped like the rest of the repo
(`feat(drawlink): …`, `fix(drawlink): …`, `docs: …`), small logical units, tree green at every commit.

## Shared code

This game is one project in an npm workspace. Code it shares with the other games lives in
`../base` and is imported as `@tggame/base/...`; read `../base/README.md` before copying code
from another game or adding hooks to anything that runs per tick, frame or message.
