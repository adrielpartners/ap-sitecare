# AP SiteCare Backup Worker Operations

## Scope

The backup worker executes queued backups only for Local VPS connections using
Dropbox storage. It does not execute restores, retention deletion, SSH/SFTP,
hosting API actions, MCP actions, or agent-triggered actions.

## Required Executables

The worker requires these fixed executable paths:

```text
/usr/bin/tar
/usr/bin/gzip
/usr/bin/mysqldump
```

The worker Docker target installs `default-mysql-client`, `tar`, and `gzip`.

## Required Environment

```text
NUXT_DATABASE_PATH
NUXT_CREDENTIAL_ENCRYPTION_KEY
NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN
NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT
NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES
NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL
NUXT_BACKUPS_DROPBOX_ENABLED
NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY
NUXT_BACKUPS_TEMP_ROOT
NUXT_BACKUPS_STALE_AFTER_MINUTES
```

`NUXT_CREDENTIAL_ENCRYPTION_KEY` must be the same durable secret used by the
dashboard. Losing it makes saved database passwords unreadable. Dropbox tokens
and plaintext database passwords must never be logged or committed.

## Local Source Mounts

Every configured Local VPS WordPress path must resolve inside an allowed base
directory. In Docker Compose, set:

```text
AP_SITECARE_BACKUP_HOST_ROOT=/absolute/host/path/containing/sites
NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES=/backup-sources
```

The host path is mounted at `/backup-sources` read-only in the dashboard and
worker containers. Configure site WordPress paths using the container-visible
path, for example `/backup-sources/example.com`.

The production VPS definition is tracked at:

```text
deploy/vps.compose.yaml
```

It mounts `/opt/sitecare/backup-sources` read-only into both services. Remote
WordPress sites must be mounted or synchronized into a dedicated child
directory before they can use the Local VPS execution adapter. Do not place
unrelated host files beneath the allowed source root.

## Running

Claim and execute at most one queued job, then exit:

```bash
npm run backup-worker
```

Poll continuously:

```bash
npm run backup-worker:continuous
```

Docker Compose runs the continuous worker as a separate service:

```bash
docker compose up -d dashboard backup-worker
```

## Job and Failure Behavior

- Claims are atomic; two workers cannot claim the same queued job.
- Running jobs heartbeat every 15 seconds.
- A later worker marks expired heartbeats failed using
  `NUXT_BACKUPS_STALE_AFTER_MINUTES`.
- Failed jobs are not automatically retried. Dashboard retry creates a new job.
- Temporary work uses an isolated mode-0700 directory and is removed in a
  `finally` cleanup path.
- Source mounts are read-only. The worker writes only to its temporary
  directory, SQLite job records, and Dropbox.

## Operational Risks

- Source files or databases can change during backup creation; application-level
  consistency beyond `mysqldump --single-transaction` is not guaranteed.
- Dropbox metadata verification confirms uploaded path and size. Local SHA-256
  checksums are uploaded for later restore/preflight verification.
- Large sites require sufficient temporary disk space for archives and dumps.
- Symlinks anywhere in the WordPress source tree cause the job to fail.
- SQLite and its WAL files require durable shared storage and separate
  infrastructure backup.
- Restore execution and retention deletion remain intentionally unavailable.
