import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ActionRequestRepository } from '../repositories/action-request-repository'
import { AuditRepository } from '../repositories/audit-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { ActionRequestService } from './action-request-service'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

describe('Phase 10 action requests', () => {
  it('supports inspectable proposals and approval without execution', async () => {
    const database = await createTestDatabase()
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const siteService = new SiteService(sites, audit)
    const site = await siteService.create({ name: 'Example', url: 'https://example.com' })
    const service = new ActionRequestService(new ActionRequestRepository(database), siteService, audit)
    const request = await service.create(site.id, 'verify-backup', 'Backup age should be confirmed.', 'agent@example.com')

    assert.equal(request.status, 'pending')
    assert.equal((await service.review(request.id, 'approved', 'operator@example.com')).status, 'approved')
    assert.equal((await service.list()).length, 1)
    await assert.rejects(service.review(request.id, 'rejected', 'operator@example.com'), /already been reviewed/)
    await destroyTestDatabase(database)
  })
})
