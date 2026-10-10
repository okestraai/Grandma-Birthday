# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile -t birthday-api .

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --workspace apps/api --include-workspace-root
COPY packages/types packages/types
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN npx prisma generate && npx nest build
# Keep only runtime dependencies (prisma stays: `prisma migrate deploy` runs from this image).
WORKDIR /repo
RUN npm prune --omit=dev --workspace apps/api --include-workspace-root

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api/package.json /repo/apps/api/prisma.config.ts ./apps/api/
COPY --from=build --chown=node:node /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 4100
CMD ["node", "dist/main.js"]
