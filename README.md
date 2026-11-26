# tggame

Multiplayer browser games for phones and laptops on the same Wi-Fi, plus a landing page that
lists them all.

| Directory | What | Port |
|---|---|---|
| `main` | Game Night, the landing page | 8081 |
| `mark_i` | Last Survivor Arena | 8090 |
| `mark_ii` | Last Survivor Run | 8091 |
| `tele` | Doodle Telephone | 8092 |
| `drawlink` | Drawlink | 8093 |

## One container, one port

```sh
./build            # builds every game and the landing page into the image "tggame"
./run              # http://localhost:8081
```

Only port 8081 leaves the container. The landing page is at `/` and each game at
`/play/<directory>/`, WebSockets included; the games' own ports stay inside.

- `PORT=9000 ./run` publishes another port.
- `./run -d` runs in the background; stop it with `docker stop tggame` or `podman stop tggame`.
- `./publish` pushes the built image to Docker Hub as `iphands/tggame`, tagged `latest` and with
  the current commit (`TAG=v1 ./publish` to name the tag). Log in first.
- The scripts use `docker` when it is installed and `podman` otherwise (`ENGINE=podman` to choose).

## Without a container

Each project runs by itself: `npm install`, then `npm run dev` or `npm run build && npm start`
in its directory. To run the lot, build each one and then `npm run all` in `main`. See
`main/README.md`, which also explains how a new game gets onto the landing page.
