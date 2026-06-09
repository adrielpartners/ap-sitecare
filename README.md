# AP SiteCare

AP SiteCare is Adriel Partners' internal operations dashboard for managed
WordPress websites. The dashboard is the product; the WordPress plugin is a
lightweight reporting agent.

## Current Phase

Phase 1 establishes the Nuxt dashboard shell, SQLite connectivity, Docker
support, and Cloudflare Access identity-header authentication.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Set `NUXT_AUTH_DEVELOPMENT_BYPASS=true` only for local development.

## Verification

```bash
npm run typecheck
npm run build
docker compose config
docker compose build
```
