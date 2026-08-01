# SiteCare Pro Backup Destinations

SiteCare stores backup destinations as central Dashboard records. One effective
independent off-site destination is executable per Pro site in Phase 7.

## Resolution and path rules

- Sites inherit the first enabled destination in the central master pool, or
  select one site-specific override.
- A destination ID is snapshotted onto each queued job, so later settings
  changes cannot redirect in-flight work.
- The default Dropbox root is `/SiteCare Backups` and can be changed in
  Dashboard Settings. Spaces are ordinary path characters and are entered
  literally; do not use `%20` or backslash escaping.
- For an App Folder-scoped app whose app folder is already named
  `SiteCare Backups`, use `/` as the Dashboard root. Dropbox then stores each
  client directly inside that app folder without creating a duplicated nested
  `SiteCare Backups` directory.
- SiteCare creates and preserves one stable client folder, then writes new
  artifacts to `Client Name/YYYY/MM/{backup-id}`.
- Changing the destination root affects new artifacts only. Exact paths for
  retained objects remain in `backup_artifact_objects`.
- Every object filename includes the website hostname, UTC timestamp, and
  backup ID.

## Credentials

- Dashboard-managed credentials and Dropbox refresh tokens are encrypted with
  the durable `NUXT_CREDENTIAL_ENCRYPTION_KEY`.
- Credentials are never returned by APIs or included in jobs, artifacts,
  notification metadata, or audit metadata.
- The Dashboard, automation worker, and backup worker must share the same
  encryption key and Dropbox application configuration.
- A revoked Dropbox grant requires an explicit reconnect. Ordinary access-token
  expiration is handled automatically from the stored refresh token.

## Dropbox app setup

1. Create one Dropbox API app. App Folder access is recommended.
2. Enable `files.metadata.read`, `files.content.read`, and
   `files.content.write`.
3. Add the exact redirect URI configured as
   `NUXT_INTEGRATIONS_DROPBOX_REDIRECT_URI`; production defaults to:
   `https://sitecare.adrielpartners.com/api/backup-destinations/oauth/callback`.
4. Configure the app key and secret in deployment secrets.
5. In Dashboard Settings, create a Dropbox destination with OAuth authorization.
   Use `/` when the App Folder itself is named `SiteCare Backups`; otherwise use
   `/SiteCare Backups` or another approved literal root.
6. Select **Connect Dropbox**, approve access once, then run **Test connection**.

Required deployment variables:

```text
NUXT_CREDENTIAL_ENCRYPTION_KEY
NUXT_INTEGRATIONS_DROPBOX_APP_KEY
NUXT_INTEGRATIONS_DROPBOX_APP_SECRET
NUXT_INTEGRATIONS_DROPBOX_REDIRECT_URI
NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT
NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL
NUXT_BACKUPS_DROPBOX_ENABLED
NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY
```

`NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN` remains supported as a temporary
runtime-managed cutover path. A runtime refresh token may instead be supplied
as `NUXT_INTEGRATIONS_DROPBOX_REFRESH_TOKEN`, but Dashboard OAuth is preferred
because connection status and reconnect history remain visible.

## Provider support

- Dropbox: OAuth connection, upload, metadata verification, temporary download
  links, and deletion adapter available. Scheduled deletion remains disabled
  until a production retention dry-run is approved.
- Google Drive: configuration record only; execution adapter pending.
- Amazon/S3-compatible: configuration record only; execution adapter pending.

An enabled backup cannot be queued unless its effective destination is enabled,
has a configured credential, and has an executable adapter.
