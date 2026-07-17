FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/api apps/api
COPY apps/web apps/web
COPY infra infra
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_REALTIME_URL=""

RUN npm run prisma:generate --workspace=@mujskaiaopora/api && npm run build --workspace=@mujskaiaopora/api && npm run build --workspace=@mujskaiaopora/web

RUN npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libstdc++

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/web apps/web

ENV NODE_ENV=production
