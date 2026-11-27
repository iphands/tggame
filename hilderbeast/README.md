# Hilder Beast

A chase game for 2 to 10 players, one screen each. The round starts with one **Hilder Beast** and
a house full of **Cousins**. Every Cousin the Beast catches becomes a Beast and joins the hunt.

```sh
npm install        # once, at the repo root
npm run dev        # http://localhost:5180 (server on 8097), hot reload
npm test           # the rules, no server needed
npm run typecheck
npm run build && npm start   # production build on http://localhost:8097
```

Phones on the same Wi-Fi join at `http://<your-ip>:5180`.

## Rules

- **Move.** WASD or the arrow keys; on a phone, drag a thumb anywhere. No momentum: you go where
  you push, and slide along walls.
- **Sight.** You see as far as your eyes reach and never round a corner. The other side is only
  drawn (and only sent to you) while it is in your line of sight. Your own side is always marked.
- **Dread.** A Cousin feels a Beast coming before they can see it, walls or no walls: the edges
  of the screen turn red and a heartbeat with a creeping tune starts up, redder, louder and
  faster the nearer it is. It says how near, never which way.
- **Cousins** hold **Boost** (Space) to run faster. It burns energy: a full bar is four seconds.
  **Pills** on the floor give back 40 %, and come back 20 seconds after they are taken.
- **The Beast** catches a Cousin by **touching** them. On foot it is no faster than a Cousin, so
  it has two boosts: **Boost** (Space), a big burst on a 9-second cooldown, and **Dash** (E), a
  quick small one every 3.5 seconds. After a catch its touch is harmless for a moment, so a
  huddle is not swept in one step.
- **Beast doors.** The swirls in the floor are paired: a Beast that walks onto one comes out of
  the other a moment later. Cousins cannot use them, but can see them flare when a Beast does.
- **Caught.** A caught Cousin stands frozen for 2.5 seconds, then is a Beast.
- **The first Beast** waits in the Cellar for 6 seconds while the Cousins scatter. Players take
  turns at starting as the Beast.

### Last Cousin Standing

No chores and no way out. The last Cousin left uncaught wins. Cousins still free after 4 minutes
win too; with two players, that is how the Cousin wins.

### Escape

- Chores are spread through the house: one more than there are Cousins (3 to 7).
- Stand at a chore and hold the action (E) to work on it. One Cousin takes 8 seconds; each helper
  adds 60 %. Walk away whenever you like: the work done is kept.
- **Working makes noise.** The Beasts hear a chore being worked on: at once, then every 3 seconds.
  They are shown roughly where, never exactly, and the workers are told they were heard.
- When every chore is done the two exits open. Hold the action at an exit for 1.5 seconds to get
  out. Whoever gets out is safe and watches the rest of the round.
- The round goes on until nobody is left in the house: every Cousin has got out or been caught,
  or 6 minutes have passed. The Cousins win if at least one of them got out; the Beasts win if
  nobody did.

## Just watching

A screen can watch without playing: press **Just watch** on the join screen, or in the lobby.
For a TV, open the game with `?watch=1` on the end of the address: it goes straight in as "TV",
never takes a seat, and shows the whole house with nothing hidden. `?watch=0` undoes it.

## Bots

The host can fill the house with bots. They play either side with only what a player in their
place could see, and they take over for anyone whose connection drops until they come back.

Every number above is in `shared/src/constants.ts`.
