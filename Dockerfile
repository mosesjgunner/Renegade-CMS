FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP_VERSION=0.1.0
ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.version=$APP_VERSION \
	org.opencontainers.image.revision=$BUILD_SHA
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ENV APP_VERSION=$APP_VERSION BUILD_SHA=$BUILD_SHA
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir -p /app/media /tmp/renegade-worker && chown -R nextjs:nodejs /app /tmp/renegade-worker
# The web server uses Next's standalone output. Payload's migration and worker
# CLIs also require the application source and their runtime dependencies; they
# are deliberately included instead of assuming standalone contains them.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./standalone/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./standalone/public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/docker ./docker
USER nextjs
EXPOSE 3000
CMD ["node", "standalone/server.js"]
