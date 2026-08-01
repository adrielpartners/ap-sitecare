# Client Portal

The Client portal is a client-safe projection of the same operational services
used by staff. It is not a second source of truth.

Clients can see only sites assigned to their active client account. The portal
shows the customer-facing plan name and included services, WordPress update
state and recent activity, Hostinger daily-backup evidence, SiteCare long-term
backup evidence when entitled, Cloudflare uptime incident summaries for Pro,
a summarized security posture, and published SiteHealth Reviews.

Hostinger and SiteCare backups remain visually and semantically separate. When
Hostinger does not provide a daily-backup timestamp, the portal says it is not
available; it does not show a false failure. Internal notes, credentials,
storage paths, raw provider payloads, account identifiers, and audit records
are never returned.

Published SiteHealth Reviews can be viewed in the Dashboard and downloaded as
a standalone client-safe HTML document. Responses are private and `no-store`.
Clients may manage multiple email recipients and categories for their own
sites. Every change passes site authorization and is audited.

The support and recommendation path is
`sitecare@adrielpartners.com`. SiteHealth recommendations remain proposals;
clients email SiteCare to approve work, and a technician records that external
approval before cleanup can begin.

## Access checks

- Client middleware rejects all non-`/api/client/` application APIs.
- Every site-specific client route checks the resolved session's site scope.
- Review routes retrieve only published, client-safe projections and then
  confirm site ownership.
- Cross-client service tests verify that scoped overviews cannot include a
  second client's site or internal fields.
