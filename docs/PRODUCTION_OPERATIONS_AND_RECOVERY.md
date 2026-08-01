# Production Operations and Recovery

This runbook is the Phase 11 operational handoff for
`sitecare.adrielpartners.com`. Commands assume the repository is deployed at
`/opt/sitecare` and Compose is run from that directory with the production
environment file at `/opt/sitecare/.env`.

## Routine operations

- Review **System Health** daily. Investigate any stale worker lease, failed
  outbox message, failed backup, integration degradation, open TLS alert, or
  open uptime incident.
- Review **Automation** for `needs-attention` jobs before retrying. A retry is a
  new audited attempt, not permission to bypass preflight.
- Review backup destination connectivity and run the Dropbox connection test
  after OAuth, credential, or root-path changes.
- Review Cloudflare Security Status after client DNS or Cloudflare changes.
- Confirm that PostgreSQL backups complete and that a restore test is performed
  at least quarterly.
- Keep AP SiteCare connector versions current. Central updates require plugin
  0.5.0 / contract 4.

## Infrastructure alert policy

Configure the VPS or external observability provider to alert an administrator
when the public `/api/health` endpoint fails twice in five minutes, any required
container is unhealthy/restarting, PostgreSQL connections fail, disk usage
exceeds 80%, a worker has not emitted/processed expected work for 15 minutes,
System Health reports a stale lease, the email outbox retains failed messages
for 15 minutes, or the Dashboard TLS certificate has fewer than 14 days left.
Send these internal platform alerts to an administrative address, not client
site recipients. Site-specific uptime, TLS, backup, update, security, and
SiteHealth email continue through their per-site categories.

## Cloudflare API token permissions

Use one account-scoped token limited to the Adriel Partners account and all
zones in that account. SiteCare needs these read permissions for portfolio and
Security Status collection:

- Account — `Account Settings Read`
- Account — `Notifications Read`
- Zone — `Zone Read`
- Zone — `DNS Read`
- Zone — `Zone Settings Read`
- Zone — `SSL and Certificates Read`
- Zone — `Bot Management Read`
- Zone — `Zone WAF Read`
- Zone — `Cache Settings Read`
- Zone — `Health Checks Read`

Do not grant DNS, settings, SSL, WAF, cache, bot, or account write permissions
for status reporting. If SiteCare will provision and adjust Standalone Health
Checks on a paid Cloudflare plan, add Zone — `Health Checks Write`; that is the
only Cloudflare write scope required by the current implementation. Free plans
do not currently include Standalone Health Checks, so this write scope does not
make the feature available on the present portfolio.

## Pre-deployment backup

Create a restricted directory outside the Git checkout and dump PostgreSQL:

```bash
install -d -m 700 /opt/sitecare-ops/postgres
docker compose --env-file /opt/sitecare/.env -f deploy/vps.compose.yaml exec -T sitecare-postgres \
  pg_dump -U sitecare -d sitecare -Fc \
  > /opt/sitecare-ops/postgres/sitecare-$(date -u +%Y%m%dT%H%M%SZ).dump
chmod 600 /opt/sitecare-ops/postgres/sitecare-*.dump
```

Also back up `/opt/sitecare/.env` to the approved password manager or encrypted
secret store. Do not place it in Git or the Dropbox client-backup tree.

Verify a dump without modifying production:

```bash
pg_restore --list /opt/sitecare-ops/postgres/sitecare-YYYYMMDDTHHMMSSZ.dump >/dev/null
```

## Deployment and migration

Migrations are append-only and run under a PostgreSQL advisory lock when a new
Dashboard or worker process initializes. Phase 9 adds migration 14. Use a
maintenance window for the first release containing migration 14.

```bash
cd /opt/sitecare
git pull --ff-only
docker compose --env-file /opt/sitecare/.env -f deploy/vps.compose.yaml config --quiet
docker compose --env-file /opt/sitecare/.env -f deploy/vps.compose.yaml build
docker compose --env-file /opt/sitecare/.env -f deploy/vps.compose.yaml up -d
docker compose --env-file /opt/sitecare/.env -f deploy/vps.compose.yaml ps
curl --fail https://sitecare.adrielpartners.com/api/health
```

Then sign in, check **System Health**, verify migration 14, inspect worker logs,
and run one reversible connection test. Do not run a real plugin rollout merely
as a deployment smoke test.

## Record-count validation

Capture these counts before and after migration and investigate any decrease:

```sql
SELECT 'sites', COUNT(*) FROM sites
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'credentials', COUNT(*) FROM site_credentials
UNION ALL SELECT 'backup_artifacts', COUNT(*) FROM backup_artifacts
UNION ALL SELECT 'wordpress_snapshots', COUNT(*) FROM wordpress_update_snapshots
UNION ALL SELECT 'sitehealth_reviews', COUNT(*) FROM sitehealth_reviews;
```

## Rollback

Application rollback uses the prior Git commit and prior container image. Do
not reverse an applied schema migration manually. Migration 14 is additive, so
the previous application can run while its tables remain unused.

If data restoration is required, stop all application workers and the
Dashboard, restore into a new empty database, validate counts, point
`NUXT_DATABASE_URL` at the recovered database, and only then restart services:

```bash
createdb -h DATABASE_HOST -U sitecare sitecare_recovered
pg_restore -h DATABASE_HOST -U sitecare -d sitecare_recovered --clean --if-exists \
  /secure/path/sitecare-YYYYMMDDTHHMMSSZ.dump
```

Never run `--clean` against the active production database.

## Emergency MFA recovery

If a user loses both the authenticator and every recovery code, verify identity
out of band, create a PostgreSQL dump, and run the explicit recovery command:

```bash
export SITECARE_MFA_RESET_EMAIL='owner@example.com'
export SITECARE_MFA_RESET_REASON='Identity verified by two administrators on YYYY-MM-DD'
npm run reset-user-mfa
```

This disables the factor, revokes every session, and writes an audit event. The
user signs in with the existing password and must enroll MFA again immediately.
Never clear MFA with an ad hoc SQL update.

## Credential encryption key recovery and rotation

`NUXT_CREDENTIAL_ENCRYPTION_KEY` is required to decrypt WordPress credentials,
backup-source credentials, destination credentials, email provider secrets,
and TOTP seeds. Loss of this key cannot be repaired from PostgreSQL. Keep an
encrypted copy in two approved administrative locations.

Rotate only after a successful PostgreSQL dump and while Dashboard/workers are
stopped. Keep the old key until validation is complete:

```bash
export SITECARE_NEW_CREDENTIAL_ENCRYPTION_KEY='new-long-random-value'
npm run rotate-credential-key
```

The rotation is one PostgreSQL transaction, verifies each new ciphertext, and
records only the rotated record count. Replace the production environment key,
restart all services together, test Dashboard login/MFA, WordPress check-in,
Dropbox, Brevo, and a backup-source connection, then securely retire the old
key.

## Disaster recovery order

1. Recover the VPS, Docker/Compose configuration, private `.env`, and TLS route.
2. Restore PostgreSQL and validate schema migration and critical record counts.
3. Restore the `sitecare-plugin-packages` volume only if an in-progress rollout
   must be resumed; otherwise leave old rollouts paused for review.
4. Start Dashboard, then email worker, automation worker, and backup worker.
5. Inspect System Health and audit events before retrying work.
6. Reconnect Dropbox OAuth only if its refresh token is revoked.
7. Verify one WordPress signed check-in and one Brevo test email.
8. Reconcile Cloudflare and Hostinger status. Free-plan Cloudflare Health Check
   limitations remain an accepted external constraint until an available API
   path is confirmed.

## Required live acceptance

Live acceptance began on 2026-08-01. Before declaring the production launch
fully accepted, complete:

- one live Hostinger shared Cloud Pro source acquisition
- one SiteCare Pro backup and supervised restore to a clean WordPress-compatible
  account
- AP SiteCare 0.5.0 installation and contract-4 check-in on a canary site
- one harmless commercial-plugin canary rollout with current recovery evidence
- one live SiteHealth Checkup, technician review, publication, download, and
  Brevo email to multiple recipients
- Admin, Team Member, and two separate Client account isolation checks
- desktop, tablet, mobile, keyboard, and screen-reader smoke review

Record the deployment commit, timestamp, database dump, operator, and results
in the production change log.

## Production change log

### 2026-08-01 — Commit `76cb0e9`

Operator: Codex, authorized by the project owner.

Deployment and recovery point:

- fast-forwarded production from `ac06c21` to `76cb0e9`
- built and restarted Dashboard, automation, backup, and email services with
  production Compose
- applied migration 14, `add_mfa_step_up_and_central_plugin_rollouts`
- preserved the server's existing untracked `db-backups/` and
  `docker-compose.yml`
- verified PostgreSQL dump
  `/opt/sitecare-ops/postgres/sitecare-pre-76cb0e9-20260801T110209Z.dump`
- dump size: 169,864 bytes
- dump SHA-256:
  `50d9410bd9250d67583cd0b513d524e2b660bb8198d9ef10b400b6432e65c211`
- restricted configuration snapshot:
  `/opt/sitecare-ops/config/sitecare-pre-76cb0e9-20260801T110209Z.env`

Passed live checks:

- public `/api/health` returned HTTP 200 with PostgreSQL connected
- unauthenticated protected APIs returned HTTP 401 and protected pages
  redirected to login
- HSTS, CSP, frame denial, content-type, permissions, and referrer headers were
  present; the Let's Encrypt certificate is valid through 2026-09-08
- PostgreSQL and Dashboard health checks passed; every required container was
  running with zero restarts
- migration 14 was the latest schema migration and the existing Admin record
  remained present; production still contained zero managed sites
- System Health reported healthy workers, queues, integrations, incidents, and
  database status
- the encrypted Dropbox OAuth destination survived restart and passed a fresh
  metadata/read-permission and content/write-permission connection test at
  `2026-08-01T11:12:19.992Z`
- Hostinger API returned 25 websites and 51 WordPress installations
- Brevo API access succeeded, the configured sender was present and active,
  unauthenticated webhook delivery was rejected, and the configured bearer
  token reached payload validation; no email was sent during this validation
- Cloudflare listed 50 zones on the first page and allowed read access to each
  zone's Health Check collection; all returned zero configured checks
- all 14 authenticated Admin pages rendered without route errors; dashboard,
  settings, and profile rendered at 390 px without page-level horizontal
  overflow

Findings and remaining gates:

- [Cloudflare's current Health Checks documentation](https://developers.cloudflare.com/health-checks/)
  lists Standalone Health Checks as unavailable on Free plans. A successful
  empty-list API read does not grant creation rights. Do not create checks until
  the owner chooses paid Cloudflare plans or revises the uptime architecture.
- the Cloudflare token cannot read the account resource, DNS records, DNSSEC,
  managed-rules, or cache-rules endpoints. It can read zone settings and
  Universal SSL. Expand its read permissions before expecting complete
  automated Security Status evidence; technician overrides remain available.
- production Admin MFA enrollment was explicitly deferred by the project owner
  on 2026-08-01. The implementation remains available, and restore or central
  plugin rollout execution remains blocked until enrollment is approved.
- no managed site exists in PostgreSQL, so Hostinger source acquisition,
  WordPress contract-4 check-in, backup/restore, SiteHealth, client isolation,
  and plugin-canary acceptance remain gated on registering the first site and
  relevant test users.
- an external connector attempted `/api/plugin/check-in` for an unknown site
  during validation. Register or reissue that site's connection before relying
  on its reports.
- the browser logged repeated Nuxt hydration-mismatch errors across page loads.
  The pages remained usable, but this needs a corrective release.
- System Health reports Dropbox OAuth as missing because it only checks runtime
  environment variables, while the live OAuth credential is intentionally
  encrypted in PostgreSQL. Correct the readiness calculation; do not reconnect
  the healthy destination as a workaround.
- VPS disk use was 71%, below the 80% alert threshold but close enough to
  monitor during backup and image growth.
- tablet, native screen-reader, full keyboard, Team Member, and separate Client
  isolation checks remain outstanding.
