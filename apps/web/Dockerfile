FROM node:22-alpine AS build
WORKDIR /app
ARG API_PROXY_URL
ARG NEXT_PUBLIC_REALTIME_URL
ENV API_PROXY_URL=$API_PROXY_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build --workspace=@mujskaiaopora/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
CMD ["node", "apps/web/server.js"]
