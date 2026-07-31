import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { CredentialService } from './credential-service'
import { SiteService } from './site-service'

describe('Phase 7 audit history', () => {
  it('lists system and site history and distinguishes credential rotation', async () => {
    const database = await createTestDatabase()
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const site = await new SiteService(sites, audit).create({ name: 'Example', url: 'https://example.com' })
    const credentials = new CredentialService('test-key', sites, audit)
    await credentials.issue(site.id)
    await credentials.issue(site.id)

    assert.deepEqual((await audit.listForSite(site.id)).map(event => event.eventType), [
      'credential.rotated',
      'credential.issued',
      'site.created'
    ])
    assert.equal((await audit.list()).length, 3)
    await destroyTestDatabase(database)
  })
})
