import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

describe('Phase 8 operational enhancements', () => {
  it('stores and updates operational site context', async () => {
    const database = await createTestDatabase()
    const repository = new SiteRepository(database)
    const service = new SiteService(repository, new AuditService(new AuditRepository(database)))
    const site = await service.create({
      name: 'Example',
      url: 'https://example.com',
      hostingProvider: 'Hostinger',
      backupStrategy: 'Daily',
      riskLevel: 'high',
      notes: 'Revenue-critical'
    })

    assert.equal(site.riskLevel, 'high')
    assert.equal((await service.update(site.id, { backupStrategy: 'Daily + Dropbox' })).backupStrategy, 'Daily + Dropbox')
    await destroyTestDatabase(database)
  })
})
