# AGENTS.md: Doodle Telephone (`tele/`)

Turn-based telephone-drawing party game. Sibling of `mark_i` / `mark_ii` in the same repo; shares
their tooling and conventions but no code. Read `README.md` for the rules and protocol.

## Commands

```sh
npm run dev         # server :8092 (tsx watch) + Vite :5175
npm test            # vitest, ~1 s, no server needed
npm run typecheck   # tsc for client+shared, then server+shared
npm run build       # tsc server → dist/, vite client → client/dist/
```

Before calling a change done: `npm test && npm run typecheck`.

**Do not test on 8092/5175.** Someone may be playing there, and there is one game per server.
Start a private pair instead:

```sh
PORT=8192 npx tsx server/src/index.ts
npx vite --port 5199 --strictPort
# open http://localhost:5199/?ws=ws://localhost:8192
node scripts/smoke.mjs ws://localhost:8192    # needs an empty lobby
```

## Layout

| Path | Role |
|---|---|
| `shared/src/constants.ts` | every tunable number and palette |
| `shared/src/rotation.ts` | who holds which book on which turn |
| `shared/src/drawing.ts` | drawing/name/guess sanitising, stroke simplification, `sameWord` |
| `shared/src/protocol.ts` | message unions + `isClientMessage` |
| `shared/src/types.ts` | `Stroke`, `Page`, `Task`, `StateView` |
| `server/src/game.ts` | the whole game as a pure state machine |
| `server/src/index.ts` | HTTP static server, WebSocket, `sync()`, bot and abandon timers |
| `server/src/bots.ts` | Doodlebot doodles and guesses |
| `client/src/main.ts` | join flow, connection, header, screen switching |
| `client/src/screens/` | one module per screen; `index.ts` maps state → screen key |
| `client/src/pad.ts` | drawing input (pointer events → strokes, undo/redo) |
| `client/src/render.ts` `fill.ts` | stroke painting, replay animation, PNG export; bucket fills, flooded at a fixed resolution so every screen agrees |
| `client/styles.css` | all styling |

## Rules that must hold

- **Hidden information.** Nothing but `Game.taskFor(id)` may expose a page before the reveal, and it
  exposes exactly one. `viewFor` never contains page content. `visiblePages` is empty until the
  reveal. If you add a field to `StateView`, extend `tests/views.test.ts`.
- **`Game` is pure.** No sockets, timers, `Date.now()` or bare `Math.random()` in `game.ts`; it takes
  an injected RNG so tests are deterministic. Timers (bot pacing, abandon reset) live in `index.ts`.
- **Never trust a client.** Every drawing goes through `sanitizeDrawing`, every string through
  `sanitizeName` / `sanitizeGuess`; host-only actions check `hostId()` in `Game`.
- **Send on change.** `sync()` runs after every handled message and resends a socket's state or task
  only when its JSON changed; pages are sent once per socket.
- **`shared/` is dependency-free** and imported by both sides: server and shared files import with a
  `.js` suffix, client files without.
- **Screens are keyed.** `screenKey()` changing rebuilds the screen; the same key only calls
  `update()`. The draw screen relies on this to survive other players' updates. Keep per-turn keys.
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
(`feat(tele): …`, `fix(tele): …`, `docs: …`), small logical units, tree green at every commit.
