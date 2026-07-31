# SiteCare Automation and Notifications

Last updated: 2026-07-31

This document is the Phase 4 operational and extension contract for durable
application work and transactional notifications.

## Process boundaries

SiteCare runs three intentionally separate worker types:

- `automation-worker`: schedules and executes general application workflows.
- `email-worker`: sends already-committed transactional outbox messages.
- `backup-worker`: retains its specialized archive, database-dump, manifest,
  checksum, and upload execution path.

Dashboard requests may validate and commit work, but must not perform
long-running operations or call an email provider directly.

## Durable automation model

The PostgreSQL model consists of:

- `automation_schedules`: persisted recurring definitions and next-run times.
- `automation_jobs`: one durable workflow request with an idempotency key.
- `automation_job_attempts`: worker, state, timing, output, and safe failure
  evidence for every claim.
- `automation_operation_locks`: a lease-backed lock for one operation within a
  site or system scope.

The standard workflow is:

```text
queued -> preflight -> running -> verifying -> succeeded
                                         \-> failed
                                         \-> needs-attention
                                         \-> cancelled
```

Transient failures return to `queued` with exponential backoff while attempts
remain. A missing handler or a condition that requires technician judgment ends
in `needs-attention`. A permanent validation failure ends in `failed`.

Claims use `FOR UPDATE SKIP LOCKED`. An active job owns both a job lease and its
operation lock. Heartbeats extend both leases. A later worker recovers an
expired lease, records the attempt as `interrupted`, releases the operation
lock, and either queues another attempt or marks the job `needs-attention` when
the attempt limit has been reached.

Cancellation is immediate for queued jobs and cooperative for active jobs.
Handlers must call the supplied cancellation check at safe boundaries. Admins
may retry only terminal `failed` or `needs-attention` jobs; a retry increases
the bounded attempt allowance without creating a second idempotency identity.

Job payloads and outputs are limited in size and reject credential-, token-,
password-, secret-, and API-key-like fields. Artifact references belong in
payload metadata instead of embedding large files or sensitive content.

## Scheduler behavior

The scheduler claims due rows in the same PostgreSQL transaction used to
enqueue their jobs and advance their next-run time. Its job idempotency key is:

```text
schedule:<schedule-id>:<due-at>
```

Phase 4 registers one five-minute entitlement synchronization schedule per
site with a service subscription. Its handler calls `EntitlementService`; it
does not duplicate plan lifecycle or override-expiration rules. Later phases
should register their handlers in `createCoreAutomationHandlers` (or a
successor registry) and use the same scheduler rather than creating another
poller.

An accepted provider request is not proof of completed work. A handler must
move through verification and return independent evidence before the job is
marked `succeeded`.

## Transactional email model

Every recipient has an independent `email_outbox` row. The service that records
the triggering domain event must enqueue those rows in the same transaction.
`idempotency_key` prevents duplicate delivery for the same event and recipient.

The worker atomically claims one eligible row, assigns a lease, and increments
its attempt count. Transient failures use bounded exponential backoff. Expired
worker leases return to `failed` and become claimable again while attempts
remain.

Outbox status meanings:

- `pending`: committed and waiting for a worker.
- `sending`: held by an active worker lease.
- `sent`: the provider accepted the request and returned a message ID.
- `delivered`: a provider webhook confirmed delivery.
- `failed`: the current or terminal provider request failed.
- `bounced`: a provider reported a hard/soft bounce or delivery error.
- `suppressed`: delivery is blocked because the recipient is suppressed.
- `cancelled`: reserved for a future controlled message-cancellation path.

Rendered text and HTML bodies are purged after provider acceptance, suppression,
or terminal failure. Durable history retains message type, site, category,
recipient, provider, safe metadata, artifact reference, attempts, status,
provider message ID, and timestamps.

## Provider configuration

The email provider interface is REST-oriented. Brevo is operational through:

```text
POST https://api.brevo.com/v3/smtp/email
```

The worker authenticates with an API key and records Brevo's returned message
ID. Mailgun, Postmark, and SendGrid provider configurations can be saved, but
their send adapters are intentionally non-operational.

Global settings control:

- selected provider
- From address and name
- Reply-To address
- branding logo URL and accent color

Provider API keys and webhook bearer tokens are encrypted with
`NUXT_CREDENTIAL_ENCRYPTION_KEY`. They are never returned by APIs. Runtime
Brevo settings remain a deployment fallback; saved database settings take
precedence.

Brevo delivery events enter through:

```text
POST /api/webhooks/email/brevo
Authorization: Bearer <configured token>
```

The public webhook route authenticates its Bearer token before accepting a
payload. Events are deduplicated by provider and provider-event ID. Hard
bounces, invalid addresses, blocks, complaints, and unsubscribes create or
refresh a suppression. An Admin may inspect and explicitly lift a suppression.

## Site recipients

`site_notification_recipients` stores the site-specific address, display name,
and enabled state. `site_notification_subscriptions` controls these categories:

- backup
- uptime
- updates
- sitehealth
- security
- service

Authentication and system messages use the same outbox but are not selectable
as site-recipient categories. Multiple recipients are supported; each receives
an independently retried and tracked message.

Email is the only operational notification channel. Telegram and SMS implement
contract stubs only and must remain labeled non-operational until a later phase
assigns their adapters, credentials, delivery events, and verification.

## Admin interfaces and APIs

The Admin **Automation** page exposes schedules, job status, attempts, safe
errors, cancellation, and retry controls. **Settings** exposes global email
identity, encrypted provider configuration, adapter readiness, delivery
history, provider events, and suppressions. Each Site Detail page has an Admin
**Notifications** tab for recipients and categories.

Protected Admin APIs:

```text
GET  /api/admin/automation/jobs
GET  /api/admin/automation/jobs/:id
POST /api/admin/automation/jobs/:id/cancel
POST /api/admin/automation/jobs/:id/retry
GET  /api/admin/automation/schedules

GET  /api/admin/email/settings
PUT  /api/admin/email/settings
PUT  /api/admin/email/providers/:provider
GET  /api/admin/email/outbox
GET  /api/admin/email/delivery-events
GET  /api/admin/email/suppressions
POST /api/admin/email/suppressions/lift

GET    /api/admin/sites/:id/notifications/recipients
POST   /api/admin/sites/:id/notifications/recipients
PUT    /api/admin/sites/:id/notifications/recipients/:recipientId
DELETE /api/admin/sites/:id/notifications/recipients/:recipientId
```

## Configuration

```text
NUXT_DATABASE_URL
NUXT_CREDENTIAL_ENCRYPTION_KEY

NUXT_EMAIL_PROVIDER=brevo
NUXT_EMAIL_BREVO_API_KEY
NUXT_EMAIL_FROM_ADDRESS
NUXT_EMAIL_FROM_NAME
NUXT_EMAIL_REPLY_TO
NUXT_EMAIL_WEBHOOK_BEARER_TOKEN

NUXT_AUTOMATION_LEASE_SECONDS=120
NUXT_AUTOMATION_HEARTBEAT_SECONDS=30
NUXT_AUTOMATION_RETRY_BASE_SECONDS=30
NUXT_AUTOMATION_POLL_SECONDS=5
```

The encryption key must be identical in the Dashboard and email worker. Losing
it makes saved provider credentials unreadable. Keep the webhook token long,
random, and distinct from the Brevo API key.

## Running and deployment

One automation iteration or continuous polling:

```bash
npm run automation-worker
npm run automation-worker:continuous
```

One email iteration or continuous polling:

```bash
npm run email-worker
npm run email-worker:continuous
```

Both local and VPS Compose definitions include separate `automation-worker`
and `email-worker` services. Deploy migration 9 before starting them. Safe
rollout order:

1. Back up PostgreSQL and deploy the Dashboard so migration 9 completes.
2. Configure the durable encryption key and Brevo sender/API settings.
3. Start the email worker and send a controlled invitation/reset test.
4. Configure and verify the authenticated Brevo webhook.
5. Start the automation worker and verify entitlement schedules and successful
   attempts in **Automation**.
6. Configure site recipients and categories before later phases begin sending
   operational notifications.

The pending production Phase 2 PostgreSQL/authentication cutover remains a
deployment prerequisite for production, but it does not block Phase 5
development.

## Current limitations

- Only `entitlements.synchronize` is registered as a general automation
  handler. Later phases supply update, monitoring, report, and backup handlers.
- Schedules are inspectable but not generally editable in the UI.
- A live Brevo account was not used in automated tests; the adapter contract,
  worker, persistence, and webhook behavior are tested with deterministic
  provider doubles.
- Mailgun, Postmark, SendGrid, Telegram, and SMS are not send-capable.
- The specialized backup worker has not been rewritten onto the general job
  tables; it retains its existing verified execution path.
