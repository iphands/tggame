# Slurp

A co-op party game for 1 to 8 players, one screen each. Everybody steers a hungry hole round the
same picnic blanket. A hole swallows whatever fits and grows with every bite; together you clear
the table before the clock runs out, then get a bigger one.

```sh
npm install        # once, at the repo root
npm run dev        # http://localhost:5178 (server on 8095), hot reload
npm test           # the rules, no server needed
npm run typecheck
npm run build && npm start   # production build on http://localhost:8095
```

Phones on the same Wi-Fi join at `http://<your-ip>:5178`.

## Rules

- **Steer.** Drag anywhere on the screen (the hole moves the way your finger does), point with
  the mouse, or use the arrow keys / WASD.
- **Eat.** Food goes down when it fits: its radius must be at most 90 % of the hole's. A new hole
  eats berries only. Then cookies, sandwiches, pies, melons and whole roast turkeys as it grows.
- **Grow.** Your hole grows by what it eats. Every other hole grows by a quarter of each bite, so
  nobody is left behind and the team's biggest hole can always reach the next size.
- **Push.** Food too big for your hole is solid to it: you shove it along. Herd it into a bigger
  teammate, but keep it on the blanket.
- **Spills.** Food knocked off the blanket costs the team 3 seconds and is put back 3 seconds later.
- **Clock.** One shared clock per course. Half of what is left (up to 12 s) carries into the next.
  Clear the table for 1 to 3 stars (time to spare, few spills). Run out and the run is over.
- **Courses.** Eight of them. Each has a bigger table, more food, more food near the edge and,
  up to course 5, one more size of food. Clear all eight to finish the banquet.
- **Prize boxes.** Swallow a wrapped box and your hole carries a power: 🧲 Super Gravity (draws
  in food from far off for 6 s), ⚡ Turbo (much faster for 6 s) or 🍗 Feast (grows at once). Press
  **Use** (or Space) to set it off. One at a time; a new box replaces what you carry. Boxes come back.
- **Rotten fish.** Run over one and your hole crawls for a few seconds. They are never drawn in,
  not even by Super Gravity, so steer round them. Neither boxes nor fish have to be eaten to
  clear the table.
- **Last piece.** Whoever swallows the last piece of food on a table gets 5 bonus bites.
- **Hungriest.** After each course you see who ate how much of it, with a crown for the most; the
  finale lists the hungriest hole on every course.
- **Players.** The table's area and the amount of food grow with the number of holes, so it is
  as crowded for eight as for one. Late arrivals watch and get a hole on the next course. A
  player who drops off keeps the seat (the hole steers itself meanwhile) and can come straight back.
- **Host.** The first player (or EasyE) picks the pace (chill, normal, spicy: the clock's length),
  chooses the whole banquet or the last course only, adds Slurpbots and starts.

## Just watching

A screen can watch without playing: press **Just watch** on the join screen, or in the lobby.
For a TV, open the game with `?watch=1` on the end of the address: it goes straight in as "TV"
and never takes a seat, in this game or the next. `?watch=0` undoes it. The watching screen sees the whole table, as anyone waiting for a hole does.

## How it works

The server owns the simulation: 60 fixed ticks a second, snapshots 30 times a second. Clients
send only where their hole should head. A client moves its own hole ahead of the server with the
same `moveHole()` and eases everything else toward what the server says. See `AGENTS.md`.

Everything on screen is drawn in code (`client/src/art.ts`); sounds are synthesised. No binary
assets.

`scripts/smoke.mjs` plays socket clients through a couple of courses against a running server
and reports the snapshot rate and size.
