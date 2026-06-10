import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import { CredentialService } from './credential-service'
import { HealthService } from './health-service'
import { SiteRegistrationService } from './site-registration-service'
import { SiteService } from './site-service'

function createServices() {
  const database = createDatabase(':memory:')
  const siteRepository = new SiteRepository(database)
  const checkInRepository = new CheckInRepository(database)
  const auditRepository = new AuditRepository(database)
  const auditService = new AuditService(auditRepository)

  return {
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
  it('creates, reads, updates, lists, and disables sites with audit events', () => {
    const { auditRepository, siteService } = createServices()
    const site = siteService.create({
      name: 'Example Site',
      url: 'https://example.com/',
      actorIdentifier: 'operator@example.com'
    })

    assert.equal(site.url, 'https://example.com')
    assert.equal(siteService.get(site.id).name, 'Example Site')
    assert.equal(siteService.list().length, 1)
    assert.equal(siteService.update(site.id, { name: 'Updated Site' }).name, 'Updated Site')
    assert.equal(siteService.disable(site.id).status, 'disabled')
    assert.deepEqual(
      auditRepository.listForSite(site.id).map(event => event.eventType).sort(),
      ['site.created', 'site.disabled', 'site.updated']
    )
  })

  it('issues encrypted credentials and rotates the active secret', () => {
    const { credentialService, siteService } = createServices()
    const site = siteService.create({ name: 'Credential Site', url: 'https://credentials.example.com' })
    const first = credentialService.issue(site.id)
    const second = credentialService.issue(site.id)

    assert.notEqual(first.secret, second.secret)
    assert.equal(credentialService.getActiveSecret(site.id), second.secret)
    assert.equal(second.credential.secretHint, second.secret.slice(-6))
    assert.equal('secretCiphertext' in second.credential, false)
  })

  it('records check-ins and returns the latest normalized health snapshot', () => {
    const { auditRepository, healthService, siteService } = createServices()
    const site = siteService.create({ name: 'Health Site', url: 'https://health.example.com' })
    const result = healthService.recordCheckIn({
      siteId: site.id,
      status: 'attention',
      wordpressVersion: '6.8',
      phpVersion: '8.3',
      pluginUpdateCount: 2,
      payload: { provider: 'wordpress' }
    })

    assert.equal(result.snapshot.pluginUpdateCount, 2)
    assert.equal(healthService.getLatestSnapshot(site.id)?.status, 'attention')
    assert.equal(
      auditRepository.listForSite(site.id).some(event => event.eventType === 'check-in.received'),
      true
    )
  })

  it('reports registration connection readiness without bypassing service state', () => {
    const { credentialService, healthService, registrationService, siteService } = createServices()
    const site = siteService.create({ name: 'Connection Site', url: 'https://connection.example.com' })

    assert.equal(registrationService.testConnection(site.id).status, 'credentials-required')
    credentialService.issue(site.id)
    assert.equal(registrationService.testConnection(site.id).status, 'awaiting-check-in')
    healthService.recordCheckIn({ siteId: site.id, status: 'healthy' })
    assert.equal(registrationService.testConnection(site.id).status, 'connected')
  })
})
