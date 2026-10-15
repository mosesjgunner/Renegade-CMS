FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

FROM node:24-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev

# Upstream npm esbuild executables embed older Go standard libraries. Keep the
# supported esbuild API/version, but build the shipped executable from its exact
# upstream source with a patched Go toolchain and retain inspectable build info.
FROM golang:1.27.2-alpine AS esbuild-runtime
WORKDIR /src
ADD --checksum=sha256:04cb2d38fb6af093577aa8bf174add7286099b65ef7854480cbbb8ff061cef1f https://codeload.github.com/evanw/esbuild/tar.gz/609683d892977362a0f99026cb74b96263d728a9 /tmp/esbuild.tar.gz
RUN tar -xzf /tmp/esbuild.tar.gz --strip-components=1 -C /src && \
    CGO_ENABLED=0 go build -trimpath -buildvcs=false -o /out/esbuild ./cmd/esbuild && \
    go version -m /out/esbuild > /out/esbuild-build.txt

FROM node:24-alpine AS builder
ARG BUILD_SHA
ENV BUILD_SHA=$BUILD_SHA
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP_VERSION=0.1.0
ARG BUILD_SHA
LABEL org.opencontainers.image.version=$APP_VERSION \
	org.opencontainers.image.revision=$BUILD_SHA
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ENV APP_VERSION=$APP_VERSION BUILD_SHA=$BUILD_SHA
RUN npm install --global npm@12.2.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir -p /app/media /tmp/renegade-worker && chown -R nextjs:nodejs /app /tmp/renegade-worker
# The web server uses Next's standalone output. Payload's migration and worker
# CLIs require runtime dependencies (including tsx for the worker), but NOT
# build or test harnesses (such as vitest, tinypool, eslint, playwright).
# Production node_modules are isolated via a dedicated --omit=dev stage.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./standalone/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./standalone/public
COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=nextjs:nodejs /app/build-provenance.json ./
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/docker ./docker
COPY --from=builder --chown=nextjs:nodejs /app/theme-packages ./theme-packages
COPY --from=esbuild-runtime /out/esbuild /tmp/runtime-esbuild
COPY --from=esbuild-runtime /out/esbuild-build.txt ./esbuild-build.txt
RUN node docker/install-runtime-esbuild.mjs && rm /tmp/runtime-esbuild
USER nextjs
EXPOSE 3000
CMD ["node", "standalone/server.js"]

# Optional target used only by the media-heavy worker. The ordinary web and
# publishing worker image remains free of FFmpeg and cannot transcode requests.
FROM runner AS media-heavy
USER root
RUN apk add --no-cache ffmpeg
USER nextjs
