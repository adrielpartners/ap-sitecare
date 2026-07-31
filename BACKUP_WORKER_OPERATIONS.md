# SiteCare Pro Backup Worker Operations

## Scope

The specialized worker executes queued SiteCare Pro long-term backups. It
supports tested Hostinger SSH/SFTP, legacy explicitly mounted Local VPS, and a
transitional database-only connection. It never performs unattended restores,
user-supplied commands, Hostinger routine restoration, MCP actions, or agent
actions.

## Required executables

The worker image installs fixed executable paths:

```text
/usr/bin/ssh
/usr/bin/sftp
/usr/bin/tar
/usr/bin/gzip
/usr/bin/mysqldump
```

Hostinger SSH/SFTP execution uses a fixed SFTP recursive download and the fixed
remote WP-CLI database export. Local and transitional database execution uses
`mysqldump --single-transaction` with a temporary mode-0600 option file.

## Required environment

```text
NUXT_DATABASE_URL
NUXT_CREDENTIAL_ENCRYPTION_KEY
NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT
NUXT_INTEGRATIONS_DROPBOX_APP_KEY
NUXT_INTEGRATIONS_DROPBOX_APP_SECRET
NUXT_INTEGRATIONS_DROPBOX_REDIRECT_URI
NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL
NUXT_BACKUPS_DROPBOX_ENABLED
NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY
NUXT_BACKUPS_TEMP_ROOT
NUXT_BACKUPS_STALE_AFTER_MINUTES
```

Use Dashboard OAuth for the destination refresh token. The backward-compatible
runtime alternatives are `NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN` and
`NUXT_INTEGRATIONS_DROPBOX_REFRESH_TOKEN`.

The encryption key must be the same durable secret used by the Dashboard and
automation worker. Losing it makes stored source and destination credentials
unreadable. Secrets and plaintext database passwords must never be logged or
committed.

## Hostinger source setup

For each Pro site selected for acceptance:

1. In Hostinger hPanel, enable Remote Access for the site/account.
2. Add the SiteCare worker's SSH public key and keep password authentication
   unnecessary.
3. Record the Hostinger host/IP, port (commonly `65002`), username, and safe
   absolute WordPress root on Site Detail.
4. Add or rotate the private key in SiteCare. It is encrypted immediately and
   never returned.
5. Run **Test hosting connection**. The test requires readable `wp-config.php`,
   discovers/pins the host key on first success, and verifies WP-CLI.
6. Queue a manual full backup and confirm files, SQL, manifest, checksums, and
   README in Dropbox before relying on the monthly schedule.

The remote root accepts only a safe absolute path without whitespace or parent
traversal. Host/user/port/root changes and key rotation return the connection to
`not-tested`. A failed test records secret-safe evidence and prevents scheduled
execution.

Hostinger Agency shared-hosting read boundaries can differ by account. Prove
that the configured user can read the required full WordPress tree. If WP-CLI
is not available, do not weaken the fixed-command boundary; retain the
transitional encrypted database path until another source is approved.

## Legacy local source mounts

Migration 12 marks existing Local VPS records `quarantined`. They are executable
only when the path exists inside an allowed read-only worker mount:

```text
AP_SITECARE_BACKUP_HOST_ROOT=/absolute/host/path/containing/sites
NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES=/backup-sources
```

Production maps `/opt/sitecare/backup-sources` to `/backup-sources`. Do not put
unrelated host files under the allowed source root.

## Running and networking

Run one claim and exit:

```bash
npm run backup-worker
```

Run continuously:

```bash
npm run backup-worker:continuous
```

Production Compose runs Dashboard, backup, automation, and email workers.
Workers join the private PostgreSQL network plus an outbound-only egress
network; they expose no ports. Egress is required for Dropbox, Brevo,
Cloudflare, Hostinger API, and Hostinger SSH/SFTP.

## Package and storage behavior

- Full Pro work requires both files and database source capability.
- File tar readability, SQL gzip integrity, and SHA-256 checksums are verified
  before upload.
- The portable package is not split and uses no proprietary or incremental
  format.
- Paths use `/SiteCare Backups/Client Name/YYYY/MM/{backup-id}` by default.
- Exact object path, checksum, size, upload, and verification state is recorded
  after each object; evidence survives a later partial failure.
- Successful and failed jobs enqueue Dashboard-generated backup email to every
  enabled site recipient subscribed to the `backup` category.

## Job, retention, and restore behavior

- Atomic claims use `FOR UPDATE SKIP LOCKED`; heartbeats run every 15 seconds.
- Stale work is failed after `NUXT_BACKUPS_STALE_AFTER_MINUTES`.
- Manual retry creates a new backup ID and never overwrites failure history.
- Monthly scheduling is deduplicated by site and UTC calendar month.
- Suspension, cancellation, downgrade, or disabled sites fail the worker's
  entitlement recheck before acquisition.
- Artifacts keep their original 24-month expiration after lifecycle changes.
- The retention automation currently records a dry run and marks candidates
  `expiration-due`. It does not delete Dropbox objects.
- Restore preflight and temporary downloads are Dashboard functions. The worker
  never changes a target host.

## Production acceptance

Before declaring Phase 7 live:

- connect Dropbox through OAuth, allow an access token to expire, and verify an
  automatic refresh plus a clean reconnect after controlled revocation
- run a full Hostinger backup, inspect every object and checksum, and verify the
  package on a clean WordPress-compatible host
- interrupt one controlled upload, verify retained partial/failure evidence,
  and complete a retry as a new artifact
- review at least one retention dry-run before separately approving deletion
- record the supervised restore target, checklist, notes, timestamps, operator,
  and outcome in SiteCare

PostgreSQL itself still requires independent infrastructure backups and tested
restoration; its Docker volume alone is not a backup.
