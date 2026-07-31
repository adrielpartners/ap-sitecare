import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HostingerClient } from '../integrations/hostinger-client'
import { AuditRepository } from '../repositories/audit-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { HostingerRepository } from '../repositories/hostinger-repository'
import { SiteRepository } from '../repositories/site-repository'
import { WordPressUpdateRepository } from '../repositories/wordpress-update-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { CredentialService } from './credential-service'
import { HealthService } from './health-service'
import { HostingerPortfolioService } from './hostinger-portfolio-service'
import { createPluginSignature, PluginAuthenticationService } from './plugin-authentication-service'
import { PluginReportingService } from './plugin-reporting-service'
import { SiteService } from './site-service'
import { WordPressUpdateService } from './wordpress-update-service'

const entitled = { async assertCapability() { return {} } }

async function foundation() {
  const database = await createTestDatabase()
  const sites = new SiteRepository(database)
  const audit = new AuditService(new AuditRepository(database))
  const siteService = new SiteService(sites, audit)
  const credentials = new CredentialService(
    'phase-five-test-key',
    sites,
    audit,
    { rotationDays: 180, overlapDays: 14 }
  )
  const updates = new WordPressUpdateService(
    new WordPressUpdateRepository(database),
    siteService,
    audit
  )
  const health = new HealthService(new CheckInRepository(database), sites, audit)
  return { database, sites, audit, siteService, credentials, updates, health }
}

describe('Phase 5 WordPress connection and update intelligence', () => {
  it('ingests versioned inventory, failed activity, and idempotent activity acknowledgements', async () => {
    const services = await foundation()
    const site = await services.siteService.create({ name: 'Detailed WordPress', url: 'https://updates.example.com' })
    await services.credentials.issue(site.id)
    const reporting = new PluginReportingService(
      services.health,
      null,
      entitled,
      services.updates,
      services.credentials
    )
    const payload = {
      contractVersion: 2,
      pluginVersion: '0.3.0',
      wordpressHomeUrl: 'https://updates.example.com/',
      wordpressVersion: '6.8.2',
      phpVersion: '8.3.10',
      pluginUpdateCount: 1,
      themeUpdateCount: 0,
      lastCronRunAt: '2026-07-31T12:00:00.000Z',
      updateInventory: {
        checkedAt: '2026-07-31T12:00:00.000Z',
        core: {
          slug: 'wordpress', name: 'WordPress Core', installedVersion: '6.8.2',
          availableVersion: null, active: true, supportStatus: 'supported',
          premiumLicenseStatus: 'not-applicable'
        },
        plugins: [{
          slug: 'commercial-plugin', name: 'Commercial Plugin', installedVersion: '2.0.0',
          availableVersion: '2.1.0', active: true, autoUpdateEnabled: false,
          supportStatus: 'unknown', premiumLicenseStatus: 'active', pluginFile: 'commercial/plugin.php'
        }],
        themes: [{
          slug: 'site-theme', name: 'Site Theme', installedVersion: '1.4.0',
          availableVersion: null, active: true, autoUpdateEnabled: false,
          supportStatus: 'supported', premiumLicenseStatus: 'unknown'
        }]
      },
      updateActivities: [{
        id: 'wp-event-failure-1', componentType: 'plugin', slug: 'commercial-plugin',
        name: 'Commercial Plugin', priorVersion: '2.0.0', targetVersion: '2.1.0',
        resultingVersion: '2.0.0', startedAt: '2026-07-31T11:59:00.000Z',
        completedAt: '2026-07-31T12:00:00.000Z', outcome: 'failed',
        errorCode: 'download_failed', errorMessage: 'Package download failed.',
        source: 'wordpress-upgrader'
      }]
    }

    const first = await reporting.recordCheckIn(site.id, '2026-07-31T12:00:01.000Z', payload)
    assert.deepEqual(first.acceptedActivityIds, ['wp-event-failure-1'])
    const detail = await services.updates.getSiteDetail(site.id)
    assert.equal(detail.snapshot?.pendingUpdateCount, 1)
    assert.equal(detail.inventory.find(item => item.slug === 'commercial-plugin')?.premiumLicenseStatus, 'active')
    assert.equal(detail.activities[0]?.outcome, 'failed')

    const secondPayload = structuredClone(payload)
    secondPayload.updateInventory.checkedAt = '2026-07-31T18:00:00.000Z'
    const second = await reporting.recordCheckIn(site.id, '2026-07-31T18:00:01.000Z', secondPayload)
    assert.deepEqual(second.acceptedActivityIds, ['wp-event-failure-1'])
    assert.equal((await services.updates.getSiteDetail(site.id)).activities.length, 1)
    await destroyTestDatabase(services.database)
  })

  it('rotates through pending and overlap credentials without disconnecting and rejects exact replays', async () => {
    const services = await foundation()
    const site = await services.siteService.create({ name: 'Rotation', url: 'https://rotation.example.com' })
    const original = await services.credentials.issue(site.id)
    const offer = await services.credentials.beginAutomaticRotation(site.id, true)
    assert.ok(offer)

    const authentication = new PluginAuthenticationService(
      'phase-five-test-key',
      services.credentials,
      services.siteService
    )
    const timestamp = '2026-07-31T12:00:00.000Z'
    const now = Date.parse(timestamp)
    const oldBody = '{"request":"old"}'
    await authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      rawBody: oldBody,
      signature: createPluginSignature(original.secret, timestamp, oldBody)
    }, now)
    assert.equal((await services.credentials.getConnectionSummary(site.id)).pendingCredential?.id, offer!.credentialId)

    const newBody = '{"request":"new"}'
    const newSignature = createPluginSignature(offer!.secret, timestamp, newBody)
    await authentication.authenticateRequest({ siteId: site.id, timestamp, rawBody: newBody, signature: newSignature }, now)
    const summary = await services.credentials.getConnectionSummary(site.id)
    assert.equal(summary.activeCredential?.id, offer!.credentialId)
    assert.equal(summary.credentials.find(credential => credential.id === original.credential.id)?.state, 'overlap')
    await assert.rejects(
      authentication.authenticateRequest({ siteId: site.id, timestamp, rawBody: newBody, signature: newSignature }, now),
      /replay was rejected/
    )
    await destroyTestDatabase(services.database)
  })
})

describe('Phase 5 Hostinger portfolio visibility', () => {
  it('matches shared-hosting websites by domain without requiring installation IDs and degrades backup evidence explicitly', async () => {
    const services = await foundation()
    const matchedSite = await services.siteService.create({ name: 'Matched', url: 'https://www.hosted.example.com' })
    const missingSite = await services.siteService.create({ name: 'Missing', url: 'https://missing.example.com' })
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/wordpress/installations')) {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response(JSON.stringify({
        data: [{
          domain: 'hosted.example.com', username: 'u123', order_id: 42,
          is_enabled: true, root_directory: '/home/u123/domains/hosted.example.com/public_html',
          created_at: '2026-01-01T00:00:00Z'
        }],
        meta: { last_page: 1 }
      }), { status: 200 })
    }
    const portfolio = new HostingerPortfolioService(
      new HostingerClient('token', 'https://developers.hostinger.com', fetcher),
      new HostingerRepository(services.database),
      services.siteService,
      services.audit
    )
    const result = await portfolio.synchronize()
    assert.deepEqual({ availability: result.availability, matched: result.matched, notFound: result.notFound }, {
      availability: 'available', matched: 1, notFound: 1
    })
    const matched = await portfolio.getSite(matchedSite.id)
    assert.equal(matched.accountUsername, 'u123')
    assert.equal(matched.wordpressInstallationId, null)
    assert.equal(matched.dailyBackupAvailability, 'not-available')
    assert.match(matched.dailyBackupMessage ?? '', /Not available/)
    assert.equal((await portfolio.getSite(missingSite.id)).availability, 'not-found')
    await destroyTestDatabase(services.database)
  })
})
