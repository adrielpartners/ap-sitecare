import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupDestinationRepository } from '../repositories/backup-destination-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import { BackupDestinationService } from './backup-destination-service'
import { SiteService } from './site-service'

function createFixture() {
  const database = createDatabase(':memory:')
  const audit = new AuditService(new AuditRepository(database))
  const sites = new SiteService(new SiteRepository(database), audit)
  const repository = new BackupDestinationRepository(database)
  const service = new BackupDestinationService({
    credentialEncryptionKey: 'fixture-encryption-key',
    dropboxAccessToken: 'runtime-secret-token',
    dropboxBackupRoot: '/AP-SiteCare',
    dropboxAccountLabel: 'Primary Dropbox',
    dropboxEnabled: true
  }, repository, audit, sites)
  const site = sites.create({ name: 'Destination Fixture', url: 'https://example.com' })
  return { audit, database, repository, service, site }
}

describe('Backup destination registry', () => {
  it('exposes runtime Dropbox as the default master destination without exposing its token', () => {
    const { service } = createFixture()
    const destinations = service.list()
    assert.equal(destinations.length, 1)
    assert.equal(destinations[0]?.id, 'runtime-dropbox')
    assert.equal(destinations[0]?.inMasterPool, true)
    assert.equal(JSON.stringify(destinations).includes('runtime-secret-token'), false)
  })

  it('encrypts saved credentials and resolves site-specific multiple destinations', () => {
    const { database, service, site } = createFixture()
    const secret = 'client-dropbox-secret'
    const destination = service.save({
      name: 'Client Dropbox',
      provider: 'dropbox',
      enabled: true,
      inMasterPool: false,
      configuration: { basePath: '/Client-Backups' },
      credential: secret
    }, 'operator@example.com')
    const settings = service.saveSiteSettings(site.id, 'override', true, ['runtime-dropbox', destination.id], 'operator@example.com')
    assert.equal(settings.effectiveDestinations.length, 2)
    assert.equal(JSON.stringify(settings).includes(secret), false)
    const stored = database.prepare('SELECT credential_ciphertext FROM backup_destinations WHERE id = ?').get(destination.id) as { credential_ciphertext: string }
    assert.equal(stored.credential_ciphertext.includes(secret), false)
  })

  it('requires the site-level multiple destination switch before accepting multiple overrides', () => {
    const { service, site } = createFixture()
    const second = service.save({
      name: 'Second Dropbox',
      provider: 'dropbox',
      enabled: true,
      inMasterPool: false,
      configuration: { basePath: '/Second' },
      credential: 'second-secret'
    }, 'operator@example.com')
    assert.throws(
      () => service.saveSiteSettings(site.id, 'override', false, ['runtime-dropbox', second.id], 'operator@example.com'),
      /Enable multiple destinations/
    )
  })
})
