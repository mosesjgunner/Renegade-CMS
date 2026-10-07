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
USER nextjs
EXPOSE 3000
CMD ["node", "standalone/server.js"]

# Optional target used only by the media-heavy worker. The ordinary web and
# publishing worker image remains free of FFmpeg and cannot transcode requests.
FROM runner AS media-heavy
USER root
RUN apk add --no-cache ffmpeg
USER nextjs
