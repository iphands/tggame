# Lightbikes

A neon party game for 2 to 16 riders, one screen each. Every bike leaves a line of light behind
it and never stops. Touch a line or a wall and you are out; the last line standing takes the
round. Bots happily make up the numbers.

It is a 2D, many-phones take on the light-cycle genre. The rules and toys borrow from GLtron
(boost, wall buster, wall acceleration, erased trails, speed presets); everything on screen and
every word is this repo's own.

```sh
npm install        # once, at the repo root
npm run dev        # http://localhost:5179 (server on 8096), hot reload
npm test           # the rules, no server needed
npm run typecheck
npm run build && npm start   # production build on http://localhost:8096
```

Phones on the same Wi-Fi join at `http://<your-ip>:5179`.

## Rules

- **Ride.** Your bike goes by itself. All you do is turn, a quarter turn at a time. It cannot
  reverse, though two quick turns make a U-turn one cell wide.
- **Steer.** Tap the left or right half of the screen to turn that way. Or swipe the way you
  want to go, or use the arrow keys / WASD; Q and E turn left and right.
- **Crash.** Any line (your own included), any block and the rim take you out. Two bikes into
  the same square at the same moment both go.
- **Score.** One point for every rider who crashes while you are still going, and one more when
  somebody crashes into your line. The match ends after the round in which somebody reaches the
  target (10, 20 or 35) and leads alone.
- **Boost.** Hold BOOST (or Shift) to pick up speed while the bar lasts: about three seconds
  from full. The bar refills in about twelve when you let go.
- **Buster.** BUST (or Space) spends half a bar and lets you pass through lines for 0.7 seconds.
  It does nothing for walls. It shares the bar with the boost, so you cannot have both for long.
- **Slipstream.** Riding within two lanes of somebody else's line speeds you up. Your own line
  does not count, and neither does a wall.
- **Tidy up.** A crashed rider's line vanishes, unless the host switches that off; then it stays
  in the way for the rest of the round.
- **Walls close in.** Forty seconds into a round the rim starts moving inward, one cell at a
  time. No round lasts for ever.
- **Floors.** Open Floor, Pillars, The Donut, Four Rooms and Pinch Point, in turn. The floor
  grows with the number of riders.
- **Players.** Late arrivals watch and ride from the next round. A player who drops off keeps
  the seat (the bike rides itself meanwhile) and can come straight back. Once only bots are
  left riding, the round plays out at four times the speed.
- **Host.** The first player (or EasyE) picks the pace (chill, normal, spicy, silly), the length
  of the match and which toys are on, adds Bikebots and starts.
- **Podium.** The finale hands out a few prizes nobody asked for: sharpest cut-offs, longest
  line, closest shaves, own worst enemy, wall inspector, first to find trouble.

## Just watching

A screen can watch without playing: press **Just watch** on the join screen, or in the lobby.
For a TV, open the game with `?watch=1` on the end of the address: it goes straight in as "TV"
and never takes a seat, in this game or the next. `?watch=0` undoes it. The watching screen follows the riders, as anyone waiting for a bike does.

## How it works

The server owns the simulation: 60 fixed ticks a second, snapshots 30 times a second. The floor
is a grid. A bike sits in a cell and is some way toward the next; it can only turn on arriving
in a cell, and a crash is simply a cell that is already taken.

A client draws its own bike a little ahead of the server so that turning answers at once. Each
turn it sends names the cell it is for, so both sides turn in the same place. Everybody else is
drawn where the last snapshot put them, ridden on by the time since. See `AGENTS.md`.

On a tall screen the floor is shown turned a quarter, so an upright phone sees more of it; taps
still mean "my left" and "my right", and swipes point the way they look.

Everything on screen is drawn in code (`client/src/art.ts`); sounds are synthesised. No binary
assets.

`scripts/smoke.mjs` plays socket clients through a short match against a running server and
reports how big the snapshots were. Add `?debug` to the page's address to get the floor as the
page sees it on `window.lightbikes`.
