# AGENTS.md: Spoons (`spoons/`)

Real-time card-passing party game, 3 to 16 players. Started as a copy of `drawlink/` and shares
its tooling, look and conventions, but no code. Read `README.md` for the rules and protocol.

## Commands

```sh
npm run dev         # server :8094 (tsx watch) + Vite :5177
npm test            # vitest, ~1 s, no server needed
npm run typecheck   # tsc for client+shared, then server+shared
npm run build       # tsc server → dist/, vite client → client/dist/
```

Before calling a change done: `npm test && npm run typecheck`.

**Do not test on 8094/5177.** Someone may be playing there, and there is one game per server.
Start a private pair instead, and stop them by PID (never `pkill` by name: the sibling games run
the same commands):

```sh
PORT=8194 npx tsx server/src/index.ts
npx vite --port 5198 --strictPort
# open http://localhost:5198/?ws=ws://localhost:8194
node scripts/smoke.mjs ws://localhost:8194    # needs an empty lobby, takes ~30 s
```

## Layout

| Path | Role |
|---|---|
| `shared/src/constants.ts` | every tunable number and palette |
| `shared/src/cards.ts` | the deck (several shuffled together past 8 players, so cards can repeat), `isCard`, `fourOfAKind` |
| `shared/src/heckles.ts` | the heckle and fumble lines, by level; `pickHeckle` |
| `shared/src/protocol.ts` | message unions + `isClientMessage` |
| `shared/src/types.ts` | `StateView`, `Task`, `Shout`, `ResultView` |
| `server/src/game.ts` | the whole game as a pure state machine |
| `server/src/index.ts` | HTTP static server, WebSocket, `sync()`, the tick and abandon timers |
| `server/src/bots.ts` | Spoonbot names, `botPass` (which card to pass on) |
| `client/src/main.ts` | join flow, connection, message handling, header, screen switching |
| `client/src/screens/` | `lobby`, `play` (the whole game is one screen), `finale`; `index.ts` maps state → screen key |
| `client/src/cards.ts` | card elements and the spoon SVG |
| `client/styles.css` | all styling |

## Rules that must hold

- **Hidden information.** While a round runs a card may leave `Game` only through `taskFor(its
  holder)`. `viewFor` carries cards only as `result.cards`, after the round. Nothing public may
  say who holds four of a kind. If you add a field to `StateView`, extend `tests/views.test.ts`.
- **A grab is judged by when the hand moved, not by when word of it arrived.** In the scramble
  each player's round trip (measured by the server, told to `Game.notePing`, capped at
  `GRAB_FAIR_CAP_MS`) is taken off their grab, and a grab waits in `settleGrabs` until nobody
  still empty-handed on a slower line could turn out to have been quicker. Never hand out a
  contested spoon by arrival order. The first grab (four of a kind) is still taken as it arrives.
- **Your own pass shows at once.** `guessTask` (client `store.ts`) shows the hand as the server
  will have it; the server's next `task` replaces the guess, and a guess nothing confirms is
  taken back. Anything else the player does to their own cards should go the same way.
- **`Game` is pure.** No sockets, timers, `Date.now()` or bare `Math.random()` in `game.ts`; time
  comes in as `now` on every action and on `tick`, randomness from the injected RNG.
- **Never trust a client.** A `pass` names a card and `Game` checks the sender holds it; `grab`
  and `heckle` carry no arguments at all; host actions check authority inside `Game`.
- **Shouts are state, not events.** A heckle or fumble is `StateView.shout` with a `seq` and the
  server time `at`; clients show a new `seq` once and drop it after `SHOUT_MS`. Everyone gets the
  same shout: that is the point.
- **The first spoon is quiet.** Clients must not add a sound, banner or animation for somebody
  else's grab. `spoonsLeft` changing is all anybody gets.
- **Send on change.** `sync()` runs after every handled message and every tick, and resends a
  socket's state or task only when its JSON changed. Clocks on screen (stall timers, countdowns)
  are computed client-side from server timestamps, so the state does not change every tick.
- **`shared/` is dependency-free** and imported by both sides: server and shared files import with a
  `.js` suffix, client files without.
- **Screens are keyed.** `screenKey()` changing rebuilds the screen; the same key only calls
  `update()`. A game is one `play:<game>` key; rounds and their results come and go inside it.
- **No binary assets.** Art is CSS/SVG, sounds are WebAudio, icons are generated.

## Adding a client → server message

1. Add it to `ClientMessage` and `isClientMessage` in `shared/src/protocol.ts` (+ a case in `tests/protocol.test.ts`).
2. Add a method on `Game` that validates phase, seat and authority itself.
3. Dispatch it in `handle()` in `server/src/index.ts`.
4. Send it from the client with `send()` from `client/src/store.ts`.
5. Document it in the README protocol table.

## Conventions

TypeScript strict, 2-space indent, single quotes, semicolons, JSDoc on non-obvious members,
`// ---- section` dividers. Conventional commits scoped like the rest of the repo
(`feat(spoons): …`, `fix(spoons): …`, `docs: …`), small logical units, tree green at every commit.

## Shared code

This game is one project in an npm workspace. Code it shares with the other games lives in
`../base` and is imported as `@tggame/base/...`; read `../base/README.md` before copying code
from another game or adding hooks to anything that runs per tick, frame or message.
