FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential default-mysql-client gzip python3 tar \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json

RUN npm ci

COPY apps/dashboard apps/dashboard

RUN npm run build --workspace=@ap-sitecare/dashboard

FROM build AS worker

ENV NODE_ENV=production
ENV NUXT_DATABASE_PATH=/data/sitecare.sqlite

CMD ["npm", "run", "backup-worker:continuous", "--workspace=@ap-sitecare/dashboard"]

FROM node:22-bookworm-slim AS runtime

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV NUXT_DATABASE_PATH=/data/sitecare.sqlite
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/apps/dashboard/.output .output
COPY --from=build /app/node_modules node_modules

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
