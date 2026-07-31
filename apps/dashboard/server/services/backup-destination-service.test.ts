import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupDestinationRepository } from '../repositories/backup-destination-repository'
import { SiteRepository } from '../repositories/site-repository'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { BackupDestinationService } from './backup-destination-service'
import { SiteService } from './site-service'

async function createFixture() {
  const database = await createTestDatabase()
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
  const site = await sites.create({ name: 'Destination Fixture', url: 'https://example.com' })
  return { audit, database, repository, service, site }
}

describe('Backup destination registry', () => {
  it('exposes runtime Dropbox as the default master destination without exposing its token', async () => {
    const { database, service } = await createFixture()
    const destinations = await service.list()
    assert.equal(destinations.length, 1)
    assert.equal(destinations[0]?.id, 'runtime-dropbox')
    assert.equal(destinations[0]?.inMasterPool, true)
    assert.equal(JSON.stringify(destinations).includes('runtime-secret-token'), false)
    await destroyTestDatabase(database)
  })

  it('encrypts saved credentials and resolves site-specific multiple destinations', async () => {
    const { database, service, site } = await createFixture()
    const secret = 'client-dropbox-secret'
    const destination = await service.save({
      name: 'Client Dropbox',
      provider: 'dropbox',
      enabled: true,
      inMasterPool: false,
      configuration: { basePath: '/Client-Backups' },
      credential: secret
    }, 'operator@example.com')
    const settings = await service.saveSiteSettings(site.id, 'override', true, ['runtime-dropbox', destination.id], 'operator@example.com')
    assert.equal(settings.effectiveDestinations.length, 2)
    assert.equal(JSON.stringify(settings).includes(secret), false)
    const stored = (await database.query<{ credential_ciphertext: string }>(
      'SELECT credential_ciphertext FROM backup_destinations WHERE id = $1',
      [destination.id]
    )).rows[0]!
    assert.equal(stored.credential_ciphertext.includes(secret), false)
    await destroyTestDatabase(database)
  })

  it('requires the site-level multiple destination switch before accepting multiple overrides', async () => {
    const { database, service, site } = await createFixture()
    const second = await service.save({
      name: 'Second Dropbox',
      provider: 'dropbox',
      enabled: true,
      inMasterPool: false,
      configuration: { basePath: '/Second' },
      credential: 'second-secret'
    }, 'operator@example.com')
    await assert.rejects(
      service.saveSiteSettings(site.id, 'override', false, ['runtime-dropbox', second.id], 'operator@example.com'),
      /Enable multiple destinations/
    )
    await destroyTestDatabase(database)
  })

  it('requires a Dropbox access token when creating a dashboard-managed destination', async () => {
    const { database, service } = await createFixture()
    await assert.rejects(
      service.save({
        name: 'Missing Token Dropbox',
        provider: 'dropbox',
        enabled: true,
        inMasterPool: true,
        configuration: { basePath: '/Missing-Token' }
      }, 'operator@example.com'),
      /Dropbox access token is required/
    )
    await destroyTestDatabase(database)
  })

  it('tests the Dropbox metadata-read and content-write permissions used by backups', async () => {
    const requests: string[] = []
    const fetcher = (async (input: string | URL | Request) => {
      requests.push(String(input))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const provider = new DropboxStorageProvider('token', '/AP-SiteCare', 'Primary Dropbox', true, 'oauth', fetcher)

    const result = await provider.testConnection()

    assert.equal(result.connected, true)
    assert.deepEqual(requests, [
      'https://api.dropboxapi.com/2/files/list_folder',
      'https://content.dropboxapi.com/2/files/upload_session/start'
    ])
  })
})
