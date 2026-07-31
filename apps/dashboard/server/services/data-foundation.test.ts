import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { CredentialService } from './credential-service'
import { HealthService } from './health-service'
import { SiteRegistrationService } from './site-registration-service'
import { SiteService } from './site-service'

async function createServices() {
  const database = await createTestDatabase()
  const siteRepository = new SiteRepository(database)
  const checkInRepository = new CheckInRepository(database)
  const auditRepository = new AuditRepository(database)
  const auditService = new AuditService(auditRepository)

  return {
    database,
    auditRepository,
    credentialService: new CredentialService('phase-3-test-key', siteRepository, auditService),
    healthService: new HealthService(checkInRepository, siteRepository, auditService),
    registrationService: new SiteRegistrationService(
      new SiteService(siteRepository, auditService),
      new HealthService(checkInRepository, siteRepository, auditService),
      new CredentialService('phase-3-test-key', siteRepository, auditService)
    ),
    siteService: new SiteService(siteRepository, auditService)
  }
}

describe('Phase 3 data foundation', () => {
  it('creates, reads, updates, lists, and disables sites with audit events', async () => {
    const { auditRepository, database, siteService } = await createServices()
    const site = await siteService.create({
      name: 'Example Site',
      url: 'https://example.com/',
      actorIdentifier: 'operator@example.com'
    })

    assert.equal(site.url, 'https://example.com')
    assert.equal((await siteService.get(site.id)).name, 'Example Site')
    assert.equal((await siteService.list()).length, 1)
    assert.equal((await siteService.update(site.id, { name: 'Updated Site' })).name, 'Updated Site')
    assert.equal((await siteService.disable(site.id)).status, 'disabled')
    assert.deepEqual(
      (await auditRepository.listForSite(site.id)).map(event => event.eventType).sort(),
      ['site.created', 'site.disabled', 'site.updated']
    )
    await destroyTestDatabase(database)
  })

  it('issues encrypted credentials and rotates the active secret', async () => {
    const { credentialService, database, siteService } = await createServices()
    const site = await siteService.create({ name: 'Credential Site', url: 'https://credentials.example.com' })
    const first = await credentialService.issue(site.id)
    const second = await credentialService.issue(site.id)

    assert.notEqual(first.secret, second.secret)
    assert.equal(await credentialService.getActiveSecret(site.id), second.secret)
    assert.equal(second.credential.secretHint, second.secret.slice(-6))
    assert.equal('secretCiphertext' in second.credential, false)
    await destroyTestDatabase(database)
  })

  it('records check-ins and returns the latest normalized health snapshot', async () => {
    const { auditRepository, database, healthService, siteService } = await createServices()
    const site = await siteService.create({ name: 'Health Site', url: 'https://health.example.com' })
    const result = await healthService.recordCheckIn({
      siteId: site.id,
      status: 'attention',
      wordpressVersion: '6.8',
      phpVersion: '8.3',
      pluginUpdateCount: 2,
      payload: { provider: 'wordpress' }
    })

    assert.equal(result.snapshot.pluginUpdateCount, 2)
    assert.equal((await healthService.getLatestSnapshot(site.id))?.status, 'attention')
    assert.equal(
      (await auditRepository.listForSite(site.id)).some(event => event.eventType === 'check-in.received'),
      true
    )
    await destroyTestDatabase(database)
  })

  it('reports registration connection readiness without bypassing service state', async () => {
    const { credentialService, database, healthService, registrationService, siteService } = await createServices()
    const site = await siteService.create({ name: 'Connection Site', url: 'https://connection.example.com' })

    assert.equal((await registrationService.testConnection(site.id)).status, 'credentials-required')
    await credentialService.issue(site.id)
    assert.equal((await registrationService.testConnection(site.id)).status, 'awaiting-check-in')
    await healthService.recordCheckIn({ siteId: site.id, status: 'healthy' })
    assert.equal((await registrationService.testConnection(site.id)).status, 'connected')
    await destroyTestDatabase(database)
  })
})
