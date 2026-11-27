# Game Night

The landing page for every game in this repo. Open it on a phone, tap a game's picture and you
are in. Each card shows whether that game's server is up (an offline game goes grey and falls
asleep), how many people and bots are in it, and what is going on right now.

## Quick start

```sh
npm install
npm run dev        # http://localhost:8081, restarts on change
```

Phones on the same Wi-Fi open `http://<your-LAN-ip>:8081`.

| Command | What it does |
|---|---|
| `npm run dev` | the server under `tsx watch` |
| `npm run build && npm start` | compiled server |
| `npm test` | unit tests, plus a check that every game's manifest matches its server |
| `npm run typecheck` | server and page type checks |

Environment: `PORT` (8081), `GAMES_DIR` (`..`, the directory that holds the games), `PROBE_HOST`
(`127.0.0.1`, where the game servers are reached from this process).

## Ports

| Port | What |
|---|---|
| 8081 | this landing page |
| 8090 | `mark_i`: Last Survivor Arena |
| 8091 | `mark_ii`: Last Survivor Run |
| 8092 | `tele`: Doodle Telephone |
| 8093 | `drawlink`: Drawlink |
| 8094 | `spoons`: Spoons |

A card links to `/play/<game>/` on the landing page's own port, and the landing page passes
that address (pages and WebSockets alike) on to the game's server. So visitors only ever need
port 8081; the games' own ports still work directly. The game ports serve the built client, so
build a game (`npm run build`) before sending people to it; under `npm run dev` they serve the
last build, not the live Vite client.

## Everything at once

```sh
npm run build && npm run all
```

`npm run all` starts every game it finds (each from its own build, on the port in its
`game.json`) and then the landing page, with each line of output labelled by game. Ctrl-C stops
them all, and if one stops the rest follow. Build each game first with
`npm install && npm run build` in its directory.

The container image does the same with only port 8081 published: see `../README.md`.

## Adding a game

Nothing here needs editing. Give the new game the next free port from 8094 and put two files in
its directory; it appears on the page within a few seconds.

`game.json`:

```json
{
  "title": "Doodle Telephone",
  "tagline": "Word, doodle, guess, repeat.",
  "port": 8092,
  "players": "3–12 players",
  "accent": "#ffd23f",
  "order": 3,
  "phases": { "lobby": "Lobby open", "draw": "Doodling" }
}
```

Only `title` and `port` are required. `accent` colours the card, `order` places it, and `phases`
gives friendly names to the phases the game reports.

`cover.svg` (or `.png`, `.webp`, `.jpg`): the picture people tap, drawn for 16:10. It is cropped
to fit, so keep the important parts away from the edges.

The game must answer `GET /health` with JSON:

```json
{ "ok": true, "phase": "lobby", "players": 3, "bots": 1, "capacity": 12 }
```

`players` includes the bots. Everything but `ok` is optional.

## How it works

- `server/src/games.ts` scans `GAMES_DIR` for `game.json` files and asks each game's `/health`.
- `server/src/index.ts` serves the page, `/api/games` (manifests plus status, reused for 1.5 s so
  many open phones cost each game one request), `/covers/<game>` and the two fonts, and proxies
  `/play/<game>/` to the game. A game's client must load its files and open its WebSocket
  relative to its page's directory for that to work (Vite `base: './'`, and see `defaultWsUrl`
  in any game's `client/src/net.ts`).
- `server/src/all.ts` is the `npm run all` launcher.
- `client/` is plain HTML, CSS and JavaScript with no build step. It polls `/api/games` every
  3 seconds while the page is visible.
