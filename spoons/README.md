# Spoons

The card-passing party game for 3 to 12 players on their own phones or laptops. Cards fly round
the table one at a time; collect **four of a kind** and grab a spoon. There is one spoon fewer
than players, so somebody always ends up without. Nobody is ever eliminated: everyone plays every
round, and whoever was left spoonless least often wins.

And if you sit on a card, the whole table gets to make fun of you.

## Quick start

```sh
npm install
npm run dev        # game server on :8094, client on :5177
```

Open `http://localhost:5177` (or `http://<your-LAN-ip>:5177` from a phone on the same Wi-Fi).
Playing alone? Add Spoonbots in the lobby.

| Command | What it does |
|---|---|
| `npm run dev` | server (`tsx watch`) + Vite client with hot reload |
| `npm run build && npm start` | production: one Node process serves client and WebSocket on `PORT` (default 8094) |
| `npm test` | unit tests (deal, passing, grabs, heckling, hidden cards, protocol) |
| `npm run typecheck` | client and server type checks |
| `node scripts/smoke.mjs [ws://host:port]` | plays a short game over real sockets against a running server with an empty lobby |

Environment: `PORT` (8094), `STATIC_DIR` (`client/dist`). The client connects to the page's own
origin; `?ws=ws://host:port` overrides it.

## How a game goes

1. **Lobby.** Everyone who opens the page lands at the same table (one game per server). The first
   player is the host: they add or remove Spoonbots, pick the number of rounds (5, 8 or 12) and deal.
2. **The deal.** Four cards each, and `players − 1` spoons in the middle. Up to eight play with
   one deck; a bigger table shuffles in a second deck, so a hand
   can hold two of the same card. Three seconds to look at
   your hand, then cards start moving. The deal moves one seat on every round.
3. **Passing.** The dealer picks up from the deck; everyone else picks up what the player before
   them passed. A card is picked up for you the moment your hand is free, so you always hold four
   or five. **Tap one of your five cards to pass it on.** The last player in the ring feeds a
   discard pile, which is shuffled back into the deck when that runs out.
4. **Grabbing.** Hold four of a kind and you may tap the spoons. That first spoon just vanishes:
   no sound, no banner. Once a spoon is gone anybody may grab one, and cards keep moving as cover.
   - **A grab at nothing** (no spoon gone yet, no four of a kind) is a *fumble*: it counts as a
     spoonless mark on the spot, the whole table is told, and your hand is off the spoons for 3 s.
   - The round ends when the spoons are gone, or 10 s after the first grab.
5. **The result.** The winning four cards, who grabbed when, who is spoonless, and the round's
   slowpoke. The next round deals after 9 s, or when the host says so.
6. **The finale.** After the last round: fewest spoonless marks wins (ties share), and the
   Slowpoke of the game is named.

Somebody who joins mid-game watches the current round and is dealt in at the next one. A player
who loses their connection keeps their seat; it passes automatically (but never grabs) until they
are back. If a player leaves for good mid-round, that round is dealt again without them.

Keyboard: `1`–`5` pass a card, `Space` grabs, `H` heckles.

## Just watching

A screen can watch without playing: press **Just watch** on the join screen, or in the lobby.
For a TV, open the game with `?watch=1` on the end of the address: it goes straight in as "TV"
and never takes a seat, in this game or the next. `?watch=0` undoes it. The watching screen sees the table and the spoons, and nobody's cards.

## Pestering

A player is *holding the table up* while they sit on a picked-up card.

| After | What happens, on every screen |
|---|---|
| 2.5 s | their seat shows a ⏳ timer; the **Heckle** button lights up for everyone else |
| 4 s | level 1: a banner with a nudge ("Hurr up slow poke"), their seat turns yellow |
| 8 s | level 2: ruder banner, a honk for everyone, their own screen shakes |
| 12 s, then every 4 s | level 3: red wobbling banner, air horn |

- Only the slowest player is picked on at a time. The stack of cards waiting behind each player is
  shown on their seat, and your own as a **+N** badge on the card in your hand.
- **The Heckle button** always aims at the slowest player (no picking), signs the heckle with your
  name, and needs 3 s to recover.
- Heckling stops once the scramble for spoons has started.
- **Slowpoke award:** time held beyond the first 4 s of each card adds up, per round and per game.
- The lines live in `shared/src/heckles.ts`; `{name}` becomes the slow player's name.

## Protocol

JSON over one WebSocket. The server sends each socket its own `state` (public table) and `task`
(that player's cards), and only when they changed.

| Client → server | |
|---|---|
| `join {name?, token?}` | sit down, or reclaim a seat with the token from `welcome` |
| `leave` | give the seat up |
| `addBot`, `removeBot` | host, lobby |
| `settings {rounds}` | host, lobby |
| `start` | host, lobby, 3+ players |
| `pass {card}` | pass one of your five cards (`"QH"`, `"TD"`: rank then suit) |
| `grab` | reach for a spoon |
| `heckle` | shout at the slowest player |
| `skip` | host: end the result screen now |
| `again` | host: finale → lobby |
| `abort` | host: end the game now |

| Server → client | |
|---|---|
| `welcome {selfId, token, now}` | `now` is the server clock |
| `full` | no room |
| `state {state}` | `StateView`: players (losses, cards waiting, `heldSince`, spoon), round, result, `shout` |
| `task {task}` | `{hand, drawn, quad}` for a seated player in a running round, else `null` |

`GET /health` → `{ok, phase, players, bots, capacity}`.
