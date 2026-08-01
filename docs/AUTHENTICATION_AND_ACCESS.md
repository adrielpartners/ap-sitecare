# SiteCare Authentication and Access

Last updated: 2026-07-31

The SiteCare Dashboard owns human authentication. Cloudflare continues to
provide proxying, TLS, WAF, rate limiting, and origin protection, but
Cloudflare identity headers do not authenticate a Dashboard user.

## First administrator

There is no public registration route. After PostgreSQL is ready, create the
first administrator once:

```bash
SITECARE_BOOTSTRAP_EMAIL=owner@example.com \
SITECARE_BOOTSTRAP_NAME="SiteCare Owner" \
SITECARE_BOOTSTRAP_PASSWORD="use-a-long-unique-password" \
NUXT_DATABASE_URL=postgresql://... \
npm run bootstrap-admin --workspace=@ap-sitecare/dashboard
```

The command refuses to run after any Admin membership exists. Do not put the
password in a committed environment file or shell script. Clear it from the
shell environment after the command finishes.

## Production configuration

Required authentication and email settings:

```text
NUXT_SITECARE_BASE_URL=https://sitecare.adrielpartners.com
NUXT_AUTH_SECURE_COOKIES=true
NUXT_AUTH_EVENT_HASH_KEY=<long random secret>
NUXT_AUTH_SESSION_DAYS=30
NUXT_EMAIL_PROVIDER=brevo
NUXT_EMAIL_BREVO_API_KEY=<Brevo API key>
NUXT_EMAIL_FROM_ADDRESS=<verified sender>
NUXT_EMAIL_FROM_NAME=SiteCare
NUXT_EMAIL_REPLY_TO=<monitored reply address>
NUXT_EMAIL_WEBHOOK_BEARER_TOKEN=<long random webhook secret>
NUXT_CREDENTIAL_ENCRYPTION_KEY=<durable encryption secret>
```

The Dashboard queues invitation and reset messages transactionally in
PostgreSQL. The separate `email-worker` service claims and sends them through
Brevo's REST API. It retries failures with bounded exponential backoff, records
provider message IDs, and purges rendered bodies after provider acceptance or
terminal failure. The email outbox is provider-neutral. Mailgun, Postmark, and
SendGrid configuration foundations exist, but only Brevo is operational.

Global provider, From, Reply-To, and branding settings may be stored through
the Admin Settings interface. Provider API keys and webhook bearer tokens are
encrypted with `NUXT_CREDENTIAL_ENCRYPTION_KEY` and are never returned. A saved
database configuration takes precedence over the runtime fallback.

## Roles

- Admin: unrestricted application and identity/configuration management.
- Team Member: operational read/write access to all sites by default, or a
  selected site set. No identity, master destination, or site-credential
  management.
- Client: client-safe access through `/portal` to sites assigned to their client
  account. Clients may manage email recipients for their own sites but cannot
  mutate operations. No provider credentials, internal notes, master settings,
  or internal audit data.

Changing a user's role or access does not require reissuing credentials.
Disabling an account immediately revokes its active sessions.

## Session and password behavior

- Passwords are hashed with salted scrypt using `N=131072`, `r=8`, and `p=1`.
- Session and CSRF tokens contain 256 random bits and are stored only as
  SHA-256 hashes.
- Sessions last 30 days and renew after active use while remaining immediately
  revocable.
- Session cookies are HttpOnly, Secure in production, SameSite Strict, and
  never stored in browser local storage.
- Unsafe API requests require the readable CSRF cookie value in the
  `X-SiteCare-CSRF` header and verify it against the server-side session.
- Password reset links last one hour; invitation links last seven days.
- Completing a password reset revokes all existing sessions.
- Five failed sign-ins within 15 minutes trigger a temporary rate limit by
  hashed email/network evidence. User-facing failures do not reveal whether an
  account exists.
- Cross-site unsafe requests and mismatched browser origins are rejected.
- Responses use restrictive frame, object, referrer, permissions, resource,
  and content-security policies.

## MFA boundary

MFA-required accounts enroll a standard six-digit TOTP authenticator from
**Profile & sessions** and receive eight one-time recovery codes. Recovery-code
hashes and the encrypted TOTP secret are stored in PostgreSQL; codes are shown
once and consumed once. After enrollment, MFA-required users must provide an
authenticator or recovery code at login. Central plugin rollout approval also
requires a fresh Admin step-up and remains disabled before enrollment.

The first bootstrapped Admin may sign in before enrollment solely to complete
setup. Enroll immediately and store the recovery codes in the password manager.
There is intentionally no self-service MFA reset; recovery after losing every
factor is an explicit database/administrator incident guided by the production
recovery runbook.

## Deployment cutover

1. Configure the production variables above.
2. Run PostgreSQL migrations through application startup.
3. Bootstrap the first Admin.
4. Start the Dashboard, `email-worker`, and `automation-worker`.
5. Sign in and invite each Team Member through **Users**.
6. Create client accounts, assign sites, and only then invite Client users.
7. Test invitation and reset delivery with the configured Brevo sender.
8. Configure Brevo transactional webhooks to
   `/api/webhooks/email/brevo` with the same Bearer token and verify delivery,
   bounce, complaint, block, and unsubscribe events.
9. Remove any Cloudflare Access login policy that would create a second login,
   while retaining proxy/TLS/WAF/origin controls.
10. Verify direct origin traffic is still blocked.

The MCP process remains local, inspection-and-proposal only. It cannot approve
or execute maintenance and does not inherit a human Dashboard session.
