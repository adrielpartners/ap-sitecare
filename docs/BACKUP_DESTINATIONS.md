# Backup Destinations

AP SiteCare stores backup destinations as central dashboard records.

## Resolution Rules

- Destinations marked `in master pool` are inherited by sites using the default `master` mode.
- A site can switch to `override` mode and select its own destinations.
- Multiple destinations are disabled per site by default and must be explicitly enabled on the site backup settings page.
- Destination IDs are snapshotted onto a queued backup job so later settings changes do not redirect queued work.

## Credentials

- Destination credentials saved through the dashboard are encrypted with `NUXT_CREDENTIAL_ENCRYPTION_KEY`.
- Credentials are never returned by APIs or included in audit metadata.
- The environment-configured Dropbox connection appears as a runtime-managed destination and remains configured through VPS environment variables.
- `NUXT_CREDENTIAL_ENCRYPTION_KEY` must be configured with the same durable value in the dashboard and backup worker before dashboard-managed credentials can be saved or used.

## Dropbox Setup

- Create one Dropbox API app for AP SiteCare.
- App Folder access is recommended because it limits SiteCare to the app's dedicated Dropbox folder.
- Enable the `files.metadata.read` and `files.content.write` scopes before generating the access token.
- Generate an access token from the app's OAuth 2 settings and save that token as the destination credential for initial setup and verification.
- The Dropbox base path is a folder inside the app's accessible Dropbox root. With App Folder access, `/AP-SiteCare` means an `AP-SiteCare` subfolder inside the app folder; do not repeat the app folder name.
- AP SiteCare does not currently implement a Dropbox OAuth authorization or callback route. A redirect URI is not required when using a generated access token. Do not configure `/api/integrations/dropbox/callback` as though it were active.
- Current Dropbox access tokens are short-lived. Durable unattended backup execution requires a future offline OAuth flow that stores a refresh token and renews access tokens; that flow is not implemented yet.
- The connection test verifies metadata-read and content-write permissions without creating a backup file.

## Provider Support

- Dropbox: configuration and backup execution supported.
- Google Drive: configuration record supported; execution adapter pending.
- Amazon/S3-compatible: configuration record supported; execution adapter pending.

An enabled backup job cannot be queued when any effective destination lacks an executable adapter or configured credential.
