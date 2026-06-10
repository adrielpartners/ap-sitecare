import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { runMigrations } from '../database/migrations'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { AuditRepository } from '../repositories/audit-repository'
import { AuditService } from './audit-service'
import { CredentialService } from './credential-service'
import { HealthService } from './health-service'
import { createPluginSignature, PluginAuthenticationService } from './plugin-authentication-service'
import { PluginClientSummaryService } from './plugin-client-summary-service'
import { PluginReportingService } from './plugin-reporting-service'
import { SiteService } from './site-service'

function createServices() {
  const database = new Database(join(mkdtempSync(join(tmpdir(), 'apsc-plugin-')), 'sitecare.sqlite'))
  runMigrations(database)
  const sites = new SiteRepository(database)
  const audits = new AuditService(new AuditRepository(database))
  const siteService = new SiteService(sites, audits)
  const health = new HealthService(new CheckInRepository(database), sites, audits)
  return {
    database,
    siteService,
    credentials: new CredentialService('test-encryption-key', sites, audits),
    authentication: new PluginAuthenticationService(
      'test-encryption-key',
      new CredentialService('test-encryption-key', sites, audits),
      siteService
    ),
    reporting: new PluginReportingService(health),
    clientSummary: new PluginClientSummaryService(siteService, health, audits)
  }
}

describe('Phase 5 plugin reporting', () => {
  it('creates deterministic HMAC signatures bound to timestamp and body', () => {
    const signature = createPluginSignature('secret', '2026-06-09T12:00:00.000Z', '{"ok":true}')
    assert.equal(signature, '3efb2c0fd0d2af602bda0cf7b99099a535dd80a24a03507c55238ae2719294c8')
  })

  it('records a normalized plugin check-in and audit event', () => {
    const services = createServices()
    const site = services.siteService.create({ name: 'Example', url: 'https://example.com' })
    services.credentials.issue(site.id)

    const result = services.reporting.recordCheckIn(site.id, '2026-06-09T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: 2,
      themeUpdateCount: 1,
      lastCronRunAt: '2026-06-09T11:59:00.000Z'
    })

    assert.equal(result.snapshot.status, 'attention')
    assert.equal(result.snapshot.pluginUpdateCount, 2)
    assert.equal(result.snapshot.themeUpdateCount, 1)
    services.database.close()
  })

  it('authenticates a fresh signed request and rejects stale or tampered requests', () => {
    const services = createServices()
    const site = services.siteService.create({ name: 'Example', url: 'https://example.com' })
    const { secret } = services.credentials.issue(site.id)
    const timestamp = '2026-06-09T12:00:00.000Z'
    const now = Date.parse(timestamp)
    const rawBody = '{"pluginUpdateCount":0}'
    const signature = createPluginSignature(secret, timestamp, rawBody)

    assert.equal(services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody
    }, now).siteId, site.id)
    assert.throws(() => services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody: '{"pluginUpdateCount":1}'
    }, now), /signature is invalid/)
    assert.throws(() => services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody
    }, now + 301_000), /timestamp is stale/)
    services.database.close()
  })

  it('rejects invalid update counts at the reporting service boundary', () => {
    const services = createServices()
    const site = services.siteService.create({ name: 'Example', url: 'https://example.com' })

    assert.throws(() => services.reporting.recordCheckIn(site.id, '2026-06-09T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: -1,
      themeUpdateCount: 0,
      lastCronRunAt: null
    }), /pluginUpdateCount/)
    services.database.close()
  })

  it('returns a client-safe summary without inventing unavailable metrics', () => {
    const services = createServices()
    const site = services.siteService.create({
      name: 'Example',
      url: 'https://example.com',
      backupStrategy: 'Daily backups retained by the hosting provider.'
    })

    const summary = services.clientSummary.get(site.id)

    assert.equal(summary.overall.status, 'unknown')
    assert.equal(summary.backups.status, 'unknown')
    assert.equal(summary.backups.lastDailyBackupAt, null)
    assert.equal(summary.backups.retentionNote, 'Daily backups retained by the hosting provider.')
    assert.equal(summary.security.threatsBlockedThisMonth, null)
    assert.equal(summary.uptime.thirtyDayPercentage, null)

    services.reporting.recordCheckIn(site.id, '2026-06-10T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: 0,
      themeUpdateCount: 0,
      lastCronRunAt: null
    })
    const protectedSummary = services.clientSummary.get(site.id)
    assert.equal(protectedSummary.overall.status, 'protected')
    assert.equal(protectedSummary.recentActivity[0]?.label, 'Site health check completed')
    services.database.close()
  })
})
