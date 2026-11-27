# Notes for agents

Read `README.md` first: it has the ports, the `game.json` format and the `/health` contract.

- Never create a git branch, anywhere in this repo. All work is committed straight to `main`, in
  small commits. This overrides any general rule about branching before committing.
- Do not test on 8081 or on the games' ports (8090 and up): someone may be using them. Start a
  private copy with `PORT=8181 npx tsx server/src/index.ts`. To see cards in every state without
  touching real games, point `GAMES_DIR` at a scratch directory of `game.json` files whose ports
  are served by a stub `/health`.
- `client/` has no build step. `app.js` is type-checked through JSDoc (`npm run typecheck`).
- Everything from a `game.json` or a `/health` reply reaches the page as text (`textContent`),
  never as HTML.
- A new game needs a `game.json`, a cover and the next free port. `tests/games.test.ts` fails if
  a manifest's port differs from the default in that game's `server/src/index.ts`.
