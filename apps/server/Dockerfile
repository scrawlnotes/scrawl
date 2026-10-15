# The Scrawl server's image: the server and what it uses of packages/core and packages/agent,
# bundled into one file, on Node 24. Build it from the repository's root:
#   docker build -f apps/server/Dockerfile -t ghcr.io/scrawlnotes/server .
# Everything it keeps is in /data; give it a volume. See design/server.md, section 8.
# The bundle is plain JavaScript, so it is built once on the machine that builds the image, and
# only the last stage is made for each platform (amd64, arm64).

FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
# Every workspace package's manifest, so that the lockfile matches; only the server's are installed.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/mcp/package.json apps/mcp/
COPY packages/agent/package.json packages/agent/
COPY packages/core/package.json packages/core/
COPY packages/editor/package.json packages/editor/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --filter "@scrawlnotes/server..."
COPY packages/agent packages/agent
COPY packages/core packages/core
COPY packages/i18n packages/i18n
COPY apps/server apps/server
RUN pnpm --filter @scrawlnotes/server build

FROM node:24-slim
LABEL org.opencontainers.image.source=https://github.com/scrawlnotes/scrawl \
  org.opencontainers.image.description="The Scrawl server: spaces a team keeps on its own machine" \
  org.opencontainers.image.licenses=AGPL-3.0-only
ENV NODE_ENV=production SCRAWL_DATA=/data PORT=8080
COPY --from=build /repo/apps/server/dist/ /app/
# wget is for the health checks of hosting panels: Coolify's runs curl or wget inside the container.
RUN apt-get update && apt-get install --yes --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*
RUN printf '#!/bin/sh\nexec node --disable-warning=ExperimentalWarning --enable-source-maps /app/server.mjs "$@"\n' > /usr/local/bin/scrawl-server \
  && chmod +x /usr/local/bin/scrawl-server \
  && mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/v1/server').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["scrawl-server", "serve"]
