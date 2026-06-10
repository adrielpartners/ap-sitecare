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
import { CredentialService } from './credential-service'
import { SiteService } from './site-service'

describe('Phase 7 audit history', () => {
  it('lists system and site history and distinguishes credential rotation', () => {
    const database = new Database(join(mkdtempSync(join(tmpdir(), 'apsc-audit-')), 'sitecare.sqlite'))
    runMigrations(database)
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const site = new SiteService(sites, audit).create({ name: 'Example', url: 'https://example.com' })
    const credentials = new CredentialService('test-key', sites, audit)
    credentials.issue(site.id)
    credentials.issue(site.id)

    assert.deepEqual(audit.listForSite(site.id).map(event => event.eventType), [
      'credential.rotated',
      'credential.issued',
      'site.created'
    ])
    assert.equal(audit.list().length, 3)
    database.close()
  })
})
