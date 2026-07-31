# PostgreSQL Migration and Rollback

## Scope

SiteCare now uses PostgreSQL for the dashboard, backup worker, and MCP server.
The application runs ordered PostgreSQL migrations automatically at startup.
The one-time importer moves existing application data from the legacy SQLite
database into an empty PostgreSQL database.

The importer:

- creates a timestamped, byte-for-byte backup beside the SQLite source;
- validates SQLite integrity and foreign keys;
- upgrades the legacy SQLite schema to its final known version;
- imports all application tables in foreign-key order inside one PostgreSQL
  transaction;
- converts SQLite integers to PostgreSQL booleans and JSON text to JSONB;
- verifies row counts and primary keys for every table;
- can safely be rerun against the same source and target.

It refuses to merge the source into a PostgreSQL database whose primary keys do
not exactly match the source. This prevents an accidental import into an active
or unrelated environment.

## Pre-cutover checklist

1. Record the current deployed application version and retain its image or
   source checkout for rollback.
2. Stop the dashboard and backup worker so SQLite cannot change during import.
3. Confirm the durable credential-encryption key is backed up.
4. Set a strong, URL-encoded PostgreSQL password in `POSTGRES_PASSWORD` and use
   the same value in `NUXT_DATABASE_URL`.
5. Start PostgreSQL and wait for its health check.
6. Take an infrastructure snapshot or `pg_dump` if the PostgreSQL target
   already exists.

Do not remove the SQLite file or its migration backup during the validation
window.

## Local or host import

With dependencies installed and PostgreSQL reachable:

```bash
npm run migrate:sqlite-to-postgres -- \
  --source /absolute/path/sitecare.sqlite \
  --target postgresql://sitecare:encoded-password@127.0.0.1:5432/sitecare
```

The target can also come from `NUXT_DATABASE_URL` and the source from
`SQLITE_SOURCE_PATH`.

## VPS import with the worker image

The worker image contains the migration script and SQLite reader. With the
legacy SQLite directory at `/opt/sitecare/data`:

```bash
docker compose -f deploy/vps.compose.yaml up -d sitecare-postgres
docker compose -f deploy/vps.compose.yaml run --rm \
  -v /opt/sitecare/data:/migration \
  backup-worker \
  npm run migrate:sqlite-to-postgres --workspace=@ap-sitecare/dashboard -- \
  --source /migration/sitecare.sqlite
```

The importer uses the worker container's `NUXT_DATABASE_URL`. Its final output
must report verified rows and the path to the rollback copy.

## Cutover verification

Start the dashboard and worker, then verify:

```bash
docker compose -f deploy/vps.compose.yaml up -d
docker compose -f deploy/vps.compose.yaml ps
curl --fail https://sitecare.adrielpartners.com/api/health
```

Confirm that managed sites, check-ins, audits, action requests, backup
policies, destinations, jobs, artifacts, and restore plans match the pre-cutover
state. Queue only a non-destructive test backup after read-only checks pass.

Create a PostgreSQL backup after acceptance:

```bash
docker compose -f deploy/vps.compose.yaml exec -T sitecare-postgres \
  pg_dump -U sitecare -d sitecare -Fc > sitecare-post-cutover.dump
```

## Rollback

If validation fails before new writes are accepted:

1. Stop the PostgreSQL-based dashboard and worker.
2. Preserve PostgreSQL logs and take a `pg_dump` for diagnosis.
3. Redeploy the recorded pre-migration application version.
4. Restore the timestamped `.pre-postgresql-*.bak` file to the legacy SQLite
   path.
5. Start the legacy dashboard and worker and verify `/api/health`.

Once the PostgreSQL application accepts new writes, a rollback to SQLite would
discard or require manually reconciling those writes. Treat the end of the
validation window as the point of no automatic rollback.

## Ongoing PostgreSQL operations

- Back up PostgreSQL independently of SiteCare website backups.
- Test restores regularly; a volume alone is not a backup.
- Monitor connection usage, storage, and failed migrations.
- Keep PostgreSQL on the private Compose network. Do not expose its port on the
  production VPS.
