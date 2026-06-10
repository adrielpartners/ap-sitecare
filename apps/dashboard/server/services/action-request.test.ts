import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { runMigrations } from '../database/migrations'
import { ActionRequestRepository } from '../repositories/action-request-repository'
import { AuditRepository } from '../repositories/audit-repository'
import { SiteRepository } from '../repositories/site-repository'
import { ActionRequestService } from './action-request-service'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

describe('Phase 10 action requests', () => {
  it('supports inspectable proposals and approval without execution', () => {
    const database = new Database(join(mkdtempSync(join(tmpdir(), 'apsc-actions-')), 'sitecare.sqlite'))
    runMigrations(database)
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const siteService = new SiteService(sites, audit)
    const site = siteService.create({ name: 'Example', url: 'https://example.com' })
    const service = new ActionRequestService(new ActionRequestRepository(database), siteService, audit)
    const request = service.create(site.id, 'verify-backup', 'Backup age should be confirmed.', 'agent@example.com')

    assert.equal(request.status, 'pending')
    assert.equal(service.review(request.id, 'approved', 'operator@example.com').status, 'approved')
    assert.equal(service.list().length, 1)
    assert.throws(() => service.review(request.id, 'rejected', 'operator@example.com'), /already been reviewed/)
    database.close()
  })
})
