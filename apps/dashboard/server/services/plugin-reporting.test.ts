import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupRepository } from '../repositories/backup-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { BackupService } from './backup-service'
import { CredentialService } from './credential-service'
import { HealthService } from './health-service'
import { createPluginSignature, PluginAuthenticationService } from './plugin-authentication-service'
import { PluginClientSummaryService } from './plugin-client-summary-service'
import { PluginReportingService } from './plugin-reporting-service'
import { SiteService } from './site-service'

const entitledForUpdateMonitoring = {
  async assertCapability() { return {} }
}

async function createServices() {
  const database = await createTestDatabase()
  const sites = new SiteRepository(database)
  const audits = new AuditService(new AuditRepository(database))
  const siteService = new SiteService(sites, audits)
  const health = new HealthService(new CheckInRepository(database), sites, audits)
  const backupRepository = new BackupRepository(database)
  const backup = new BackupService({
    dropboxAccessToken: 'test-token',
    dropboxBackupRoot: '/AP-SiteCare',
    dropboxAccountLabel: 'Test Dropbox',
    dropboxEnabled: true,
    dropboxTokenStrategy: 'runtime-access-token',
    allowedLocalBaseDirectories: ['/backup-sources'],
    credentialEncryptionKey: 'test-encryption-key'
  }, backupRepository, siteService, audits)
  return {
    database,
    backupRepository,
    siteService,
    credentials: new CredentialService('test-encryption-key', sites, audits),
    authentication: new PluginAuthenticationService(
      'test-encryption-key',
      new CredentialService('test-encryption-key', sites, audits),
      siteService
    ),
    reporting: new PluginReportingService(health, backup, entitledForUpdateMonitoring),
    clientSummary: new PluginClientSummaryService(siteService, health, audits)
  }
}

describe('Phase 5 plugin reporting', () => {
  it('creates deterministic HMAC signatures bound to timestamp and body', () => {
    const signature = createPluginSignature('secret', '2026-06-09T12:00:00.000Z', '{"ok":true}')
    assert.equal(signature, '3efb2c0fd0d2af602bda0cf7b99099a535dd80a24a03507c55238ae2719294c8')
  })

  it('records a normalized plugin check-in and audit event', async () => {
    const services = await createServices()
    const site = await services.siteService.create({ name: 'Example', url: 'https://example.com' })
    await services.credentials.issue(site.id)

    const result = await services.reporting.recordCheckIn(site.id, '2026-06-09T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: 2,
      themeUpdateCount: 1,
      lastCronRunAt: '2026-06-09T11:59:00.000Z'
    })

    assert.equal(result.snapshot.status, 'attention')
    assert.equal(result.snapshot.pluginUpdateCount, 2)
    assert.equal(result.snapshot.themeUpdateCount, 1)
    await destroyTestDatabase(services.database)
  })

  it('stores plugin-detected backup credentials encrypted and redacts check-in history', async () => {
    const services = await createServices()
    const site = await services.siteService.create({ name: 'Example', url: 'https://example.com' })

    await services.reporting.recordCheckIn(site.id, '2026-06-09T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: 0,
      themeUpdateCount: 0,
      lastCronRunAt: null,
      backupSource: {
        wordpressPath: '/home/example/public_html',
        databaseHost: 'localhost',
        databasePort: 3306,
        databaseName: 'wordpress',
        databaseUsername: 'wp_user',
        databasePassword: 'database-secret',
        providerLabel: 'example-host',
        detectedAt: '2026-06-09T12:00:00.000Z'
      }
    })

    const connection = await services.backupRepository.getConnection(site.id)
    assert.equal(connection?.localPath, '/home/example/public_html')
    assert.equal(connection?.databaseConfigured, true)
    assert.equal(connection?.databaseName, 'wordpress')
    const stored = (await services.database.query<{ payload_json: Record<string, unknown>, database_password_ciphertext: string }>(
      'SELECT payload_json, database_password_ciphertext FROM site_check_ins JOIN hosting_connections USING (site_id) WHERE site_id = $1',
      [site.id]
    )).rows[0]!
    assert.equal(JSON.stringify(stored.payload_json).includes('database-secret'), false)
    assert.equal(JSON.stringify(stored.payload_json).includes('databasePasswordConfigured'), true)
    assert.equal(stored.database_password_ciphertext.includes('database-secret'), false)
    await destroyTestDatabase(services.database)
  })

  it('authenticates a fresh signed request and rejects stale or tampered requests', async () => {
    const services = await createServices()
    const site = await services.siteService.create({ name: 'Example', url: 'https://example.com' })
    const { secret } = await services.credentials.issue(site.id)
    const timestamp = '2026-06-09T12:00:00.000Z'
    const now = Date.parse(timestamp)
    const rawBody = '{"pluginUpdateCount":0}'
    const signature = createPluginSignature(secret, timestamp, rawBody)

    assert.equal((await services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody
    }, now)).siteId, site.id)
    await assert.rejects(services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody: '{"pluginUpdateCount":1}'
    }, now), /signature is invalid/)
    await assert.rejects(services.authentication.authenticateRequest({
      siteId: site.id,
      timestamp,
      signature,
      rawBody
    }, now + 301_000), /timestamp is stale/)
    await destroyTestDatabase(services.database)
  })

  it('rejects invalid update counts at the reporting service boundary', async () => {
    const services = await createServices()
    const site = await services.siteService.create({ name: 'Example', url: 'https://example.com' })

    await assert.rejects(services.reporting.recordCheckIn(site.id, '2026-06-09T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: -1,
      themeUpdateCount: 0,
      lastCronRunAt: null
    }), /pluginUpdateCount/)
    await destroyTestDatabase(services.database)
  })

  it('returns a client-safe summary without inventing unavailable metrics', async () => {
    const services = await createServices()
    const site = await services.siteService.create({
      name: 'Example',
      url: 'https://example.com',
      backupStrategy: 'Daily backups retained by the hosting provider.'
    })

    const summary = await services.clientSummary.get(site.id)

    assert.equal(summary.overall.status, 'unknown')
    assert.equal(summary.backups.status, 'unknown')
    assert.equal(summary.backups.lastDailyBackupAt, null)
    assert.equal(summary.backups.retentionNote, 'Daily backups retained by the hosting provider.')
    assert.equal(summary.security.threatsBlockedThisMonth, null)
    assert.equal(summary.uptime.thirtyDayPercentage, null)

    await services.reporting.recordCheckIn(site.id, '2026-06-10T12:00:00.000Z', {
      wordpressVersion: '6.8.1',
      phpVersion: '8.3.7',
      pluginUpdateCount: 0,
      themeUpdateCount: 0,
      lastCronRunAt: null
    })
    const protectedSummary = await services.clientSummary.get(site.id)
    assert.equal(protectedSummary.overall.status, 'protected')
    assert.equal(protectedSummary.recentActivity[0]?.label, 'Site health check completed')
    await destroyTestDatabase(services.database)
  })
})
