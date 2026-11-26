# Every game plus the landing page in one image, all reached through one port.
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY . .
# Each directory with a package.json is a project: build it, then drop what only the build needed.
RUN set -e; \
    for dir in */; do \
      [ -f "$dir/package.json" ] || continue; \
      echo "==> building $dir"; \
      (cd "$dir" && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund); \
    done

FROM docker.io/library/node:22-alpine
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
WORKDIR /app/main
USER node
# The landing page. It passes /play/<game>/ on to the games, which stay inside the container.
EXPOSE 8081
CMD ["node", "dist/server/src/all.js"]
