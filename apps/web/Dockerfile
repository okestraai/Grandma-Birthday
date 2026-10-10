# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/web/Dockerfile -t birthday-web .

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root --ignore-scripts
COPY packages/types packages/types
COPY apps/web apps/web
ARG VITE_SITE_URL
ENV VITE_SITE_URL=${VITE_SITE_URL}
WORKDIR /repo/apps/web
RUN npx vite build && node scripts/precompress.mjs

# The runtime needs only Node itself: server/index.mjs has no dependencies.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/dist ./dist
COPY --from=build --chown=node:node /repo/apps/web/server ./server
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
