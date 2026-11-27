# @tggame/base

Code that more than one game uses. Every game depends on this package; nothing here depends on
a game.

| Folder | What | Used by |
|---|---|---|
| `src/server/http.ts` | static client, `/health`, placeholder page, WebSocket server setup | all games |
| `src/client/` | `dom`, `fx` (confetti, toast), `textedit`, `storage`, `audio` engine, `net` (`SocketClient`, `wsUrl`) | party games; `net` and `textedit` also the platformers |
| `src/party/` | client `store`, server `roster` (host, bots, names, colours), `draw/` (page, pens, stroke checks, fill, paint) | `tele`, `drawlink`, `spoons` |
| `src/platformer/` | art (`color`, `themes`), `controls`, `quality`, `particles`, `audio`, `perfMeter`, `interp`, `levels` core, physics constants, wire types | `arena`, `runner` |
| `src/shared/` | `text` (names, lines, word comparison), `rng` | server and browser |
| `src/testing/` | `seeded` RNG for tests | game tests |
| `css/` | `party.css`, `party-sketch.css`, `party-ranking.css`, `platformer.css` | imported at the top of each game's `styles.css` |
| `scripts/icons.mjs` | PNG icon generator; each game supplies its pixel art | all games |

Import by path: `@tggame/base/client/dom`, `@tggame/base/css/party.css`, `@tggame/base/icons`.

## Building

The games import the built files in `dist/`. Every game's `dev`, `build`, `test` and
`typecheck` builds base first, and `npm run dev` in a game also keeps base rebuilding on change,
so there is normally nothing to do by hand. `npm run build` here does it directly.

Source files use NodeNext imports (`./x.js`), because the servers load them as plain Node ESM.

## What belongs here, and the performance rule

Move code here when two games have the same code, not when they have similar code.

Code that runs per simulation tick, per frame, per pointer event or per socket message is only
ever moved **verbatim**. It gets no new callback, hook, option lookup or wrapper; if sharing it
would need one, it stays in its game. Per-game differences are settled once at start-up (an
options object read when a server, store or screen is created), and shared constants used in hot
code are plain exports that the game re-exports. That is why the physics step, combat, the
drawing pad's pointer handling, each game's `sync()` and the snapshot loop are still per game.
