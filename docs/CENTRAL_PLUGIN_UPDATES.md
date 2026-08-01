# Central Plugin Update Operations

Central plugin updates are an Admin-only controlled operation. The Dashboard
accepts one manually distributed WordPress plugin ZIP and coordinates a
recovery-gated, canary-first rollout to connected sites that report an older
version of the same plugin.

## Safety boundary

- Uploads accept ZIP files only, default to 50 MiB, and are never web-served.
- Archive paths, expanded size, entry count, symbolic links, executable file
  types, top-level directory, WordPress plugin header, slug, and version are
  validated before the package leaves quarantine.
- SHA-256 and administrator-supplied provenance are immutable database evidence.
- The built-in scan is structural. No external malware scanner is configured;
  the package is therefore marked `external-unavailable`, which must remain
  visible to the administrator.
- Each WordPress download URL is an opaque, hashed, single-use token with a
  ten-minute lifetime. WordPress verifies the SHA-256 checksum again.
- The connector accepts only a signed `plugin-update` request. It does not
  expose arbitrary commands, shell execution, file browsing, or generic upload.
- Contract version 4 and AP SiteCare plugin 0.5.0 are required.
- A selected target must report the exact plugin file and installed version.
- SiteCare Pro uses a verified SiteCare backup no older than 35 days. Core and
  Plus require technician-confirmed Hostinger backup evidence with an explicit
  validity date that cannot outlive Hostinger's 30-day retention window.
- The Action Request and Admin TOTP step-up must both succeed before any job is
  queued.
- The canary batch runs first. The failure threshold cannot exceed the canary
  size; reaching it pauses the rollout, and only failed targets can be retried.
- The automation worker's site operation lock and rollout concurrency setting
  prevent overlapping site work. Every target records its before, requested,
  resulting, timing, response, and normalized failure evidence.

## Administrator workflow

1. Install AP SiteCare 0.5.0 manually on managed sites and let each site report
   contract version 4.
2. Enroll an authenticator under **Profile & sessions**. Save the one-time
   recovery codes in the password manager.
3. Open **Central Updates** and upload the vendor ZIP with a provenance note.
4. Select **Discover targets**. Review every category and dry-run message.
5. For a Core or Plus site without recovery evidence, confirm a current
   Hostinger backup and record its reference, completion time, validity, and
   notes. Rediscover targets.
6. Deselect any site that should not participate, then save the selection.
7. Enter the Admin authenticator code and confirm the canary.
8. Watch the rollout and Automation views. The remaining batch releases only
   after the canary succeeds below the configured halt threshold.
9. Retry only a failed target after investigating it and confirming that its
   recovery evidence remains valid.

## Failure and recovery

The Dashboard does not attempt an unattended rollback. A failed update is
marked for technician intervention. Use the retained recovery evidence to
restore through Hostinger for routine backups or through the supervised
SiteCare restore workflow for a SiteCare artifact. Record the recovery in the
incident or relevant operational notes.

Package storage is shared only by the Dashboard and automation-worker
containers through the `sitecare-plugin-packages` volume. Configure a different
path only when both processes mount the same private directory:

```text
NUXT_PLUGIN_PACKAGES_ROOT=/var/lib/ap-sitecare/plugin-packages
NUXT_PLUGIN_PACKAGES_MAXIMUM_BYTES=52428800
```

Never store this path below the public web root.
