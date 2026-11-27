# Notes for agents (whole repo)

- Never create a git branch. All work is committed straight to `main`, in small commits. This
  overrides any general rule about branching before committing.
- Each game and `main/` has its own `AGENTS.md`; read the one for the directory you are working in.

## Netcode: standards, rules and tips

The games are played on a server about 125 ms away (250 ms round trip, more on a phone). Every
change that touches input, movement, timing or messages is judged at that distance, not on a LAN.

### Test on a slow line, always

- `?lag=125&jitter=20` on any game's address holds every message, both ways, for 125 ms plus up to
  20 (`base/src/client/lag.ts`). Add `&stall=300` and every few seconds everything is held for
  300 ms and then let go at once, which is what TCP does when it loses a packet.
- `?net=1` shows the net graph: ping, jitter, traffic, and each game's own lines
  (`setNetExtra` in `base/src/client/netMeter.ts`). It is on by itself whenever `?lag=` is.
- A netcode change is not done until it has been played (or driven in a headless browser) with
  `?lag=125&jitter=20`, and again with `&stall=300`. Numbers to watch: how far the drawn player is
  from where the server will have them, and how often a prediction had to be put back.
- The pretend line's delay happens inside the page, where the server's own ping cannot see it.
  To try a rule that rests on ping (spoons' scramble, drawlink's first guess) with `?lag=`, start
  the private server with `TRUST_CLIENT_PING=1`. Never set that where strangers play.
- Private servers only: `PORT=18xxx npx tsx server/src/index.ts`, with the client built to a
  scratch directory (`npx vite build --outDir <scratch>`, `STATIC_DIR=<scratch>`). Stop them by
  the pid that owns the port, never with `pkill -f`.

### What `base` gives every game

- **Ping and clock** (`base/src/client/clock.ts`, `net.ts`, `server/http.ts`): the socket pings
  under the game's own messages; no game sees a `ping` or a `pong`. Read `clock.rtt`,
  `clock.jitter` and `serverNow()`. On the server, `pingOf(ws)` is the round trip the server
  measured itself (a WebSocket ping frame the page has no say in): rules rest on that one.
  `shownPingOf(ws)` is what the page claims, fit only for showing. Never estimate the server's clock from one message, and never
  from when a message happened to arrive: a message that queued has the wrong time on it.
- **Interpolation** (`base/src/platformer/interp.ts`): other players are drawn a little in the
  past, between two snapshots, by the server's sim time and never by arrival time. The delay
  is 75 ms on a steady line and grows with the unevenness it measures; when the buffer runs dry,
  motion carries on for up to 100 ms (`alpha` passes 1) instead of freezing. Whatever reads a
  bracket must lerp plainly, with no clamp to 1.
- **Stamped commands and prediction** (arena, runner: `client/src/predict.ts`, `Game.enqueue`):
  the pattern for any game with a body the player steers. Copy it, do not reinvent it.

- **Screens that only watch** (`base/src/party/roster.ts`, `client/watch.ts`, `party/watchRow.ts`):
  a TV in the room joins with `watch: true` (from **Just watch**, or `?watch=1` in the address)
  and is a `watcher`: a spectator who is never given a seat until they ask for one. The join says
  it again on every reconnect. Seat players only through `unseated`, `promote` and `reseat`, so a
  watcher is never dealt in, never costs a bot its seat and never counts toward the players a
  game needs. A game that can take a body out mid-game overrides `unseat` (hilderbeast does).

### Rules

1. **The server owns the result; the client owns the feel.** Positions, hits, scores and who won
   are the server's. What the player's own hands did is shown at once, without waiting.
2. **Never wait for the echo of your own input.** Your own player is predicted with the same code
   the server runs (it lives in `<game>/shared/src`, pure, no `Date.now()` or `Math.random()`),
   starting from the newest snapshot and carried forward through everything sent since.
3. **Never pull a predicted thing toward a snapshot.** A snapshot is a round trip old. Carry it
   forward first, then compare. (Slurp and lightbike both did the former and rubber-banded.)
4. **No constant may assume a short line.** A lead, a patience, a tolerance or a window that
   depends on the trip to the server is worked out from `clock.rtt` and `clock.jitter`, with a
   floor that keeps the LAN behaviour and a ceiling past which the game stops guessing.
5. **Say when an input is for, not just what it is.** A turn names its cell (lightbike), an input
   names its tick (arena, runner). The server then does it in the same place the client did, and
   a late one is done at once and reported so the client can lead by more.
6. **Compare what happened, not how many things happened.** On a slow line the server is always
   an input or two behind you. Check its newest step against the same step of yours; give up on
   one only after a round trip and some patience.
7. **Hide corrections, never the truth.** When a prediction was wrong, the simulation takes the
   server's word at once; only the drawing eases across, over about 100 ms. Past a few body
   widths it is a teleport: cut, do not slide.
8. **Other players are in the past; you are in the future.** Do not judge a race, a hit or a
   pickup by arrival order. Judge it by what each player saw, within a cap (about 300 ms), and
   say so in the game's own `AGENTS.md`.
9. **Timers count to a server time.** Send the deadline, read `serverNow()`, draw the
   difference. Do not count down from a number that was already old when it arrived.
10. **After a stall, only the newest counts.** Several snapshots arriving together are one
    snapshot: reconcile against the last, play each effect once, never replay a backlog.
11. **A hidden tab is not a player.** Its timers crawl and its clock goes stale: send a neutral
    input when hidden, and start the clock again when it returns.
12. **Nothing sent may vanish silently.** A message that matters (a submission, a grab, a join)
    is kept and sent again after a reconnect, or the player is told it did not go.

### Tips

- Unknown message types are ignored by every game server, and cost one message of the socket's
  budget. That is what lets `base` add plumbing without touching seven protocols.
- Make the decision a pure function (`leadFor`, `predictHole`) and test it against a pretend
  server that is a trip away (`slurp/tests/predict.test.ts` is the pattern).
- When predicting, effects you cause (a jump, a turn, a gulp) play from the prediction; the
  server's copy of the same effect for your own id is dropped. Results (damage, a kill, a score)
  always wait for the server.
- A moving platform is a pure function of sim time: send its definition once, not its position
  thirty times a second.
- WebSocket is TCP: nothing is lost, things are late and then arrive in a bunch. Size buffers and
  patience from the jitter you measure, and clamp everything that is a time.
- Not worth doing yet: WebTransport or WebRTC (nginx cannot proxy the first, and at low loss TCP
  costs little), rollback (needs a small deterministic sim), predicting other players.
