# syntax=docker/dockerfile:1
# Build context is ./services (shared library + npm workspaces lockfile).
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY auth/package.json auth/
COPY items/package.json items/
COPY matching/package.json matching/
COPY claims/package.json claims/
COPY realtime/package.json realtime/
COPY notify/package.json notify/
# Production dependencies only: no dev dependencies in the final image.
RUN npm ci --omit=dev -w shared -w auth && npm cache clean --force

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node auth ./auth
RUN rm -rf /app/auth/test /app/auth/Dockerfile
USER node
WORKDIR /app/auth
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:4001/health || exit 1
CMD ["node", "src/index.js"]
