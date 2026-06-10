# AP SiteCare

AP SiteCare is Adriel Partners' internal operations dashboard for managed
WordPress websites. The dashboard is the product; the WordPress plugin is a
lightweight reporting agent.

## Version One

Version One is complete through Phase 11:

- managed-site registration and credentials
- signed WordPress reporter check-ins
- operational health dashboard
- audit history and operational context
- read-only external provider visibility
- inspection-and-proposal agent APIs
- action-request review
- inspection-and-proposal MCP tools

Phase 12 action execution is intentionally not implemented.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Set `NUXT_AUTH_DEVELOPMENT_BYPASS=true` only for local development.

Before issuing site credentials, set and securely back up:

```text
NUXT_CREDENTIAL_ENCRYPTION_KEY
```

Optional read-only provider settings are documented in `.env.example`.

## WordPress Reporter

Install the plugin from:

```text
plugins/ap-sitecare
```

In WordPress, open **Settings → AP SiteCare**, enter the dashboard URL, Site
ID, and Site Secret, then test the connection and send the first check-in.

## MCP

Run the local stdio MCP server against the configured database:

```bash
npm run mcp
```

The MCP server can inspect SiteCare state and create Action Requests. It cannot
approve or execute actions.

## Verification

```bash
npm run typecheck
npm test
npm run build
docker compose config
docker compose build
```
