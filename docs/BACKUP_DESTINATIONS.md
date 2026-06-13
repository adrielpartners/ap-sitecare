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

## Provider Support

- Dropbox: configuration and backup execution supported.
- Google Drive: configuration record supported; execution adapter pending.
- Amazon/S3-compatible: configuration record supported; execution adapter pending.

An enabled backup job cannot be queued when any effective destination lacks an executable adapter or configured credential.
