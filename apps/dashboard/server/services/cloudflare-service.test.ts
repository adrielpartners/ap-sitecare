import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CloudflareClient } from '../integrations/cloudflare-client'
import { CloudflareRepository } from '../repositories/cloudflare-repository'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditRepository } from '../repositories/audit-repository'
import { AuditService } from './audit-service'
import { CloudflareService, verifyCloudflareWebhookSecret } from './cloudflare-service'
import { NotificationService } from './notification-service'
import { SiteService } from './site-service'

const proEntitlements = {
  async get() {
    return {
      underlyingPlan: { name: 'SiteCare Pro' },
      capabilities: { 'uptime-monitoring': true },
      settings: { uptimeIntervalMinutes: 5, uptimeAlertFailureThreshold: 2 }
    } as any
  }
}

async function foundation(fetcher = healthCheckFetcher()) {
  const database = await createTestDatabase()
  const sites = new SiteRepository(database)
  const siteService = new SiteService(sites, new AuditService(new AuditRepository(database)))
  const site = await siteService.create({ name: 'Cloudflare Site', url: 'https://www.example.com' })
  const now = '2026-07-31T12:00:00.000Z'
  await new CloudflareRepository(database).saveConnection({
    siteId: site.id,
    zoneId: 'zone-1',
    zoneName: 'example.com',
    accountId: 'account-1',
    availability: 'available',
    homepageUrl: site.url,
    healthCheckId: 'health-1',
    healthCheckName: `sitecare-${site.id}`,
    healthCheckStatus: 'healthy',
    normalIntervalSeconds: 300,
    alertFailureThreshold: 2,
    capabilities: { healthChecks: 'available' },
    lastSyncedAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now
  })
  await new NotificationService(database).saveRecipient(site.id, {
    email: 'ops@example.com', displayName: 'Operations', enabled: true, categories: ['uptime']
  }, 'admin@example.com')
  const service = new CloudflareService(
    new CloudflareClient('token', fetcher, 'https://api.cloudflare.test/client/v4'),
    database,
    proEntitlements
  )
  return { database, site, service, repository: new CloudflareRepository(database) }
}

describe('Phase 6 Cloudflare uptime incidents', () => {
  it('opens an incident on the second 60-second failure, emails once, and restores the normal interval on recovery', async () => {
    const patchIntervals: number[] = []
    const services = await foundation(healthCheckFetcher(patchIntervals))
    const first = await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:00:00.000Z', reason: 'Origin returned HTTP 503',
      providerEventId: 'failure-1', source: 'cloudflare-webhook'
    })
    assert.equal(first.status, 'first-failure')
    assert.equal((await services.repository.listIncidents(services.site.id)).length, 0)
    assert.equal((await new EmailOutboxRepository(services.database).list({ limit: 100 })).length, 0)
    assert.deepEqual(patchIntervals, [60])
    assert.equal((await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:00:00.000Z', reason: 'Origin returned HTTP 503',
      providerEventId: 'failure-1', source: 'cloudflare-webhook'
    })).duplicate, true)

    const second = await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:01:00.000Z', reason: 'Origin returned HTTP 503',
      providerEventId: 'failure-2', source: 'cloudflare-reconciliation'
    })
    assert.equal(second.status, 'incident')
    const incident = (await services.repository.listIncidents(services.site.id))[0]!
    assert.equal(incident.startedAt, '2026-07-31T12:00:00.000Z')
    assert.equal(incident.failureCount, 2)
    assert.equal((await new EmailOutboxRepository(services.database).list({ limit: 100 })).length, 1)

    const recovered = await services.service.processObservation(services.site.id, {
      status: 'healthy', observedAt: '2026-07-31T12:03:20.000Z', reason: null,
      providerEventId: 'recovery-1', source: 'cloudflare-webhook'
    })
    assert.equal(recovered.status, 'recovered')
    assert.deepEqual(patchIntervals, [60, 300])
    const stored = (await services.repository.listIncidents(services.site.id))[0]!
    assert.equal(stored.status, 'recovered')
    assert.equal(stored.durationSeconds, 200)
    assert.equal((await new EmailOutboxRepository(services.database).list({ limit: 100 })).length, 2)
    assert.equal((await services.repository.findMonitor(services.site.id))?.consecutiveFailures, 0)
    await destroyTestDatabase(services.database)
  })

  it('discards a one-minute transient failure and deduplicates repeated provider events', async () => {
    const services = await foundation()
    await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:00:00.000Z', reason: 'Timeout',
      providerEventId: 'transient-1', source: 'cloudflare-webhook'
    })
    const recovery = await services.service.processObservation(services.site.id, {
      status: 'healthy', observedAt: '2026-07-31T12:00:45.000Z', reason: null,
      providerEventId: 'transient-recovery', source: 'cloudflare-webhook'
    })
    assert.equal(recovery.transientFailureDiscarded, true)
    assert.equal((await services.repository.listObservations(services.site.id)).length, 0)
    const duplicate = await services.service.processObservation(services.site.id, {
      status: 'healthy', observedAt: '2026-07-31T12:05:00.000Z', reason: null,
      providerEventId: 'healthy-1', source: 'cloudflare-webhook'
    })
    assert.equal(duplicate.duplicate, false)
    assert.equal((await services.service.processObservation(services.site.id, {
      status: 'healthy', observedAt: '2026-07-31T12:05:00.000Z', reason: null,
      providerEventId: 'healthy-1', source: 'cloudflare-webhook'
    })).duplicate, true)
    await destroyTestDatabase(services.database)
  })

  it('alerts separately for TLS failures without opening downtime', async () => {
    const services = await foundation()
    const result = await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:00:00.000Z',
      reason: 'TLS certificate verification failed', providerEventId: 'tls-1', source: 'cloudflare-webhook'
    })
    assert.equal(result.status, 'tls-error')
    assert.equal(result.countedAsDowntime, false)
    assert.equal((await services.repository.listIncidents(services.site.id)).length, 0)
    const observation = (await services.repository.listObservations(services.site.id))[0]!
    assert.equal(observation.status, 'tls-error')
    assert.equal(observation.excludedFromDowntime, true)
    assert.equal((await new EmailOutboxRepository(services.database).list({ limit: 100 }))[0]?.messageType, 'uptime.tls-alert')
    await destroyTestDatabase(services.database)
  })

  it('excludes maintenance failures and purges only raw history older than 60 days', async () => {
    const services = await foundation()
    await services.service.createMaintenanceWindow(services.site.id, {
      startsAt: '2026-07-31T11:00:00.000Z', endsAt: '2026-07-31T13:00:00.000Z', reason: 'Approved deployment'
    }, 'tech@example.com')
    const result = await services.service.processObservation(services.site.id, {
      status: 'unhealthy', observedAt: '2026-07-31T12:00:00.000Z', reason: 'Maintenance response',
      providerEventId: 'maintenance-1', source: 'cloudflare-webhook'
    })
    assert.equal(result.excluded, true)
    assert.equal((await services.repository.listIncidents(services.site.id)).length, 0)
    assert.equal((await services.repository.listObservations(services.site.id))[0]?.status, 'maintenance')
    await services.repository.createObservation({
      id: 'old-observation', siteId: services.site.id, incidentId: null,
      providerEventId: 'old', source: 'cloudflare-reconciliation', status: 'healthy', reason: null,
      excludedFromDowntime: false, observedAt: '2026-05-01T00:00:00.000Z', metadata: {}, createdAt: '2026-05-01T00:00:00.000Z'
    })
    assert.equal(await services.service.purgeRawHistory(new Date('2026-07-31T12:00:00.000Z')), 1)
    assert.equal((await services.repository.listObservations(services.site.id)).length, 1)
    await destroyTestDatabase(services.database)
  })

  it('uses Cloudflare reconciliation to confirm a failure when a webhook is missed', async () => {
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
      return new Response(JSON.stringify({
        success: true,
        result: {
          id: 'health-1', name: 'sitecare-health', status: 'unhealthy',
          failure_reason: 'Origin timeout', interval: payload.interval ?? 60,
          consecutive_fails: 1, consecutive_successes: 1
        }
      }), { status: 200 })
    }
    const services = await foundation(fetcher)
    assert.equal((await services.service.reconcileUptime(
      services.site.id, new Date('2026-07-31T12:00:00.000Z')
    )).status, 'first-failure')
    assert.equal((await services.service.reconcileUptime(
      services.site.id, new Date('2026-07-31T12:01:00.000Z')
    )).status, 'incident')
    assert.equal((await services.repository.listIncidents(services.site.id)).length, 1)
    await destroyTestDatabase(services.database)
  })

  it('configures Cloudflare to follow redirects and require a final 2xx response', async () => {
    let requestBody: Record<string, any> = {}
    const client = new CloudflareClient('token', async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        success: true,
        result: { id: 'health-1', name: 'sitecare-test', status: 'unknown', interval: 300, consecutive_fails: 1, consecutive_successes: 1 }
      }), { status: 200 })
    }, 'https://api.cloudflare.test/client/v4')
    await client.createHealthCheck('zone-1', {
      name: 'sitecare-test', address: 'example.com', type: 'HTTPS', port: 443,
      interval: 300, consecutiveFails: 1, consecutiveSuccesses: 1, path: '/'
    })
    assert.equal(requestBody.http_config.follow_redirects, true)
    assert.deepEqual(requestBody.http_config.expected_codes, ['2xx'])
    assert.equal(requestBody.http_config.allow_insecure, false)
  })
})

describe('Phase 6 Cloudflare security evidence', () => {
  it('builds API statuses and lets technician evidence override unavailable controls', async () => {
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input)
      const result = url.includes('/zones?')
        ? [{ id: 'zone-1', name: 'example.com', status: 'active', paused: false, account: { id: 'account-1' } }]
        : url.includes('/dns_records')
          ? [{ name: 'www.example.com', type: 'CNAME', proxied: true, proxiable: true }]
          : url.endsWith('/settings')
            ? [
                ['automatic_https_rewrites', 'on'], ['always_use_https', 'on'],
                ['opportunistic_encryption', 'on'], ['brotli', 'on'], ['http3', 'on'],
                ['browser_check', 'on'], ['cache_level', 'basic'], ['security_level', 'high']
              ].map(([id, value]) => ({ id, value }))
            : url.endsWith('/dnssec') ? { status: 'active' }
              : url.includes('/ssl/universal') ? { enabled: true }
                : url.endsWith('/bot_management') ? { fight_mode: true }
                  : url.includes('http_request_firewall_managed') ? { rules: [{ action: 'execute', enabled: true }] }
                    : url.includes('http_request_cache_settings') ? { rules: [] }
                      : {}
      return new Response(JSON.stringify({ success: true, result }), { status: 200 })
    }
    const services = await foundation(fetcher)
    const controls = await services.service.synchronizeSecurity(services.site.id, 'tech@example.com')
    assert.equal(controls.find(control => control.controlKey === 'proxy-cdn')?.status, 'active')
    assert.equal(controls.find(control => control.controlKey === 'security-level')?.status, 'review')
    assert.equal(controls.find(control => control.controlKey === 'apo')?.status, 'unavailable')
    const overridden = await services.service.setTechnicianSecurityStatus(
      services.site.id, 'apo', 'active', 'Verified in the Cloudflare dashboard.', 'tech@example.com'
    )
    assert.equal(overridden.find(control => control.controlKey === 'apo')?.status, 'active')
    assert.equal(overridden.find(control => control.controlKey === 'apo')?.source, 'technician')
    await destroyTestDatabase(services.database)
  })

  it('uses constant-time webhook secret comparison semantics', () => {
    assert.equal(verifyCloudflareWebhookSecret('shared-secret', 'shared-secret'), true)
    assert.equal(verifyCloudflareWebhookSecret('wrong', 'shared-secret'), false)
    assert.equal(verifyCloudflareWebhookSecret(undefined, 'shared-secret'), false)
  })
})

function healthCheckFetcher(intervals: number[] = []) {
  return async (_input: string | URL | Request, init?: RequestInit) => {
    const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    if (typeof payload.interval === 'number') intervals.push(payload.interval)
    return new Response(JSON.stringify({
      success: true,
      result: {
        id: 'health-1', name: 'sitecare-health', status: 'healthy',
        interval: payload.interval ?? 300, consecutive_fails: 1, consecutive_successes: 1
      }
    }), { status: 200 })
  }
}
