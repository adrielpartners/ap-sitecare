# Security Review — 2026-07-31

The Phase 11 review covered authentication, authorization, sessions, MFA,
uploads, HMAC requests, webhooks, secrets, client projections, dependency
health, and production configuration.

Implemented controls:

- salted scrypt passwords, persisted login throttling, generic login errors,
  invitation expiry, password-reset expiry, and session revocation
- 30-day server sessions with `HttpOnly`, `Secure` in production,
  `SameSite=Strict`, and per-session CSRF tokens
- login MFA after enrollment for MFA-required users, plus mandatory TOTP or
  one-time recovery-code step-up for central plugin rollout approval
- server-side Admin, Team Member, Client, permission, and site-scope checks
- cross-site request rejection, origin-host validation, restrictive security
  headers, request IDs, and no-store responses for sensitive downloads
- per-site HMAC credentials, five-minute timestamp windows, atomic exact replay
  claims, dual-key rotation, and no generic remote WordPress command endpoint
- authenticated Cloudflare and Brevo webhooks with replay/idempotency handling
- AES-256-GCM encrypted stored secrets and a transactional key-rotation tool
- private plugin-package storage, bounded ZIP validation, SHA-256 verification,
  one-use download tokens, recovery preflight, Action Request approval, Admin
  MFA, canary halt, and audited outcomes
- client-safe projections that omit credentials, raw provider data, internal
  notes, storage paths, and audit records
- structured logs with sensitive-key redaction and an Admin-only operational
  health view that returns configuration presence, never values
- `npm audit` reports zero known vulnerabilities after updating `adm-zip` to
  0.6.0.

Accepted limitations:

- Plugin packages receive bounded structural validation but no third-party
  malware scan. Administrators must obtain packages from trusted vendors and
  review provenance before approval.
- TOTP enrollment presents a manual secret/URI rather than a rendered QR code.
- SiteCare does not automatically roll back a failed plugin update. Recovery is
  supervised from plan-appropriate backup evidence.
- Cloudflare Health Check and notification capabilities on Free plans require
  live account verification and may be unavailable. SiteCare reports that
  honestly rather than falling back to an internal probe.
- MFA is mandatory for bootstrapped Admin users after enrollment. The first
  Admin can sign in before enrollment solely to complete setup; high-risk
  plugin execution remains blocked until enrollment.
- External DDoS, rate limiting, database network isolation, VPS patching, and
  off-host log/alert retention remain infrastructure responsibilities.

Production must restrict PostgreSQL to the internal network, protect the VPS
and SSH account with key-based access, store `.env` outside Git with mode 600,
retain off-host database and encryption-key backups, and alert on container
health, disk pressure, certificate expiry, failed workers, and persistent
System Health degradation.
