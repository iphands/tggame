# tggame

Multiplayer browser games for phones and laptops on the same Wi-Fi, plus a landing page that
lists them all.

| Directory | What | Port |
|---|---|---|
| `main` | Game Night, the landing page | 8081 |
| `arena` | Last Survivor Arena | 8090 |
| `runner` | Last Survivor Run | 8091 |
| `tele` | Doodle Telephone | 8092 |
| `drawlink` | Drawlink | 8093 |
| `spoons` | Spoons | 8094 |
| `slurp` | Slurp | 8095 |

`base/` holds the code the games share (servers, clients, drawing, platformer core, styles); see
`base/README.md`. The repo is one npm workspace: run `npm install` once, here or in any project.

## One container, one port

```sh
./build            # builds every game and the landing page into the image "tggame"
./run              # http://localhost:8081
```

Only port 8081 leaves the container. The landing page is at `/` and each game at
`/play/<directory>/`, WebSockets included; the games' own ports stay inside.

- `./build` caches per project: dependencies install once, `base/` builds once, and after a
  change to one game only that game is rebuilt (a change to `base/` rebuilds the games). The
  Dockerfile is generated from the directories that have a `package.json`; `./build --print`
  shows it.
- `PORT=9000 ./run` publishes another port.
- `./run -d` runs in the background; stop it with `docker stop tggame` or `podman stop tggame`.
- `./create` makes a lasting container named `tggame` on port 8082 without starting it
  (`PORT=…`, `NAME=…` to change); start it with `docker start tggame` or `podman start tggame`.
- `./publish` pushes the built image to Docker Hub as `iphands/tggame`. Tags name the kind of
  machine it was built on: `latest-arm64` or `latest-x64`, plus the commit (`<commit>-arm64`).
  `latest` is whichever was pushed last. Log in first.
- The scripts use `docker` when it is installed and `podman` otherwise (`ENGINE=podman` to choose).

## Without a container

```sh
npm install                       # once, for every project
cd tele && npm run dev            # one game, with hot reload
npm run build                     # at the root: build everything
npm test                          # at the root: every project's tests
cd main && npm run all            # after a build: every game plus the landing page
```

See `main/README.md`, which also explains how a new game gets onto the landing page. A new game
also needs adding to `workspaces` in the root `package.json`.
