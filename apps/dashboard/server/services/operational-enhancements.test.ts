import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { runMigrations } from '../database/migrations'
import { AuditRepository } from '../repositories/audit-repository'
import { SiteRepository } from '../repositories/site-repository'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

describe('Phase 8 operational enhancements', () => {
  it('stores and updates operational site context', () => {
    const database = new Database(join(mkdtempSync(join(tmpdir(), 'apsc-operations-')), 'sitecare.sqlite'))
    runMigrations(database)
    const repository = new SiteRepository(database)
    const service = new SiteService(repository, new AuditService(new AuditRepository(database)))
    const site = service.create({
      name: 'Example',
      url: 'https://example.com',
      hostingProvider: 'Hostinger',
      backupStrategy: 'Daily',
      riskLevel: 'high',
      notes: 'Revenue-critical'
    })

    assert.equal(site.riskLevel, 'high')
    assert.equal(service.update(site.id, { backupStrategy: 'Daily + Dropbox' }).backupStrategy, 'Daily + Dropbox')
    database.close()
  })
})
