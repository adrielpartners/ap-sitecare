import { randomUUID } from 'node:crypto'
import type { BackupDestination, BackupDestinationMode, BackupDestinationProvider, SiteBackupDestinationSettings } from '../domain/types'
import { BackupDestinationRepository } from '../repositories/backup-destination-repository'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'

const providers: BackupDestinationProvider[] = ['dropbox', 'google-drive', 's3-compatible']

export interface BackupDestinationRuntimeSettings {
  credentialEncryptionKey: string
  dropboxAccessToken: string
  dropboxBackupRoot: string
  dropboxAccountLabel: string
  dropboxEnabled: boolean
}

export interface SaveBackupDestinationInput {
  id?: string
  name: string
  provider: BackupDestinationProvider
  enabled: boolean
  inMasterPool: boolean
  configuration: Record<string, unknown>
  credential?: string | null
}

export class BackupDestinationService {
  constructor(
    private readonly settings: BackupDestinationRuntimeSettings,
    private readonly repository = new BackupDestinationRepository(),
    private readonly audit = new AuditService(),
    private readonly sites = new SiteService()
  ) {}

  list(): BackupDestination[] {
    this.ensureRuntimeDropbox()
    return this.repository.list()
  }

  save(input: SaveBackupDestinationInput, actorIdentifier: string): BackupDestination {
    this.validate(input)
    const existing = input.id ? this.repository.get(input.id) : null
    if (input.id && !existing) throw new Error('Backup destination not found.')
    if (existing?.credentialSource === 'runtime') throw new Error('Runtime-managed destinations must be changed through environment configuration.')
    const now = new Date().toISOString()
    const destination: BackupDestination = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim(),
      provider: input.provider,
      enabled: input.enabled,
      inMasterPool: input.inMasterPool,
      credentialSource: 'encrypted',
      configuration: this.cleanConfiguration(input.provider, input.configuration),
      credentialConfigured: Boolean(input.credential || (existing && this.repository.getCredentialCiphertext(existing.id))),
      executable: input.provider === 'dropbox',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const credentialCiphertext = input.credential
      ? encryptSecret(input.credential, this.settings.credentialEncryptionKey)
      : existing ? this.repository.getCredentialCiphertext(existing.id) : null
    this.repository.save(destination, credentialCiphertext)
    this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: existing ? 'backup.destination.updated' : 'backup.destination.created',
      metadata: { destinationId: destination.id, provider: destination.provider, enabled: destination.enabled, inMasterPool: destination.inMasterPool }
    })
    return destination
  }

  async test(id: string, actorIdentifier: string) {
    const destination = this.list().find(item => item.id === id)
    if (!destination) throw new Error('Backup destination not found.')
    const result = destination.provider === 'dropbox'
      ? await this.dropbox(destination).testConnection()
      : {
          provider: destination.provider,
          configured: destination.credentialConfigured,
          connected: false,
          message: `${destination.name} is saved, but its execution adapter is not implemented yet.`,
          checkedAt: new Date().toISOString()
        }
    this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.destination.tested',
      metadata: { destinationId: destination.id, provider: destination.provider, connected: result.connected }
    })
    return result
  }

  getSiteSettings(siteId: string): SiteBackupDestinationSettings {
    this.sites.get(siteId)
    const settings = this.repository.getSiteSettings(siteId)
    return { siteId, ...settings, effectiveDestinations: this.resolveForSite(siteId) }
  }

  saveSiteSettings(siteId: string, mode: BackupDestinationMode, allowMultiple: boolean, destinationIds: string[], actorIdentifier: string): SiteBackupDestinationSettings {
    this.sites.get(siteId)
    if (!['master', 'override'].includes(mode)) throw new Error('Unsupported backup destination mode.')
    const uniqueIds = [...new Set(destinationIds)]
    const destinations = this.list()
    if (uniqueIds.some(id => !destinations.some(destination => destination.id === id))) throw new Error('A selected backup destination was not found.')
    if (mode === 'override' && !uniqueIds.length) throw new Error('Select at least one site-specific backup destination.')
    if (!allowMultiple && uniqueIds.length > 1) throw new Error('Enable multiple destinations before selecting more than one destination.')
    this.repository.saveSiteSettings(siteId, mode, allowMultiple, mode === 'override' ? uniqueIds : [], new Date().toISOString())
    this.audit.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.site-destinations.updated',
      metadata: { mode, allowMultiple, destinationCount: mode === 'override' ? uniqueIds.length : this.resolveForSite(siteId).length }
    })
    return this.getSiteSettings(siteId)
  }

  resolveForSite(siteId: string): BackupDestination[] {
    const settings = this.repository.getSiteSettings(siteId)
    const destinations = this.list().filter(destination => destination.enabled)
    const selected = settings.mode === 'override'
      ? settings.destinationIds.map(id => destinations.find(destination => destination.id === id)).filter(Boolean) as BackupDestination[]
      : destinations.filter(destination => destination.inMasterPool)
    return settings.allowMultiple ? selected : selected.slice(0, 1)
  }

  credential(destination: BackupDestination): string {
    if (destination.credentialSource === 'runtime') return this.settings.dropboxAccessToken
    const ciphertext = this.repository.getCredentialCiphertext(destination.id)
    if (!ciphertext) throw new Error(`${destination.name} does not have a configured credential.`)
    return decryptSecret(ciphertext, this.settings.credentialEncryptionKey)
  }

  dropbox(destination: BackupDestination): DropboxStorageProvider {
    if (destination.provider !== 'dropbox') throw new Error(`${destination.name} does not have an executable backup adapter yet.`)
    return new DropboxStorageProvider(
      this.credential(destination),
      destination.configuration.basePath ?? '',
      destination.name,
      destination.enabled,
      destination.credentialSource === 'runtime' ? 'runtime-access-token' : 'oauth'
    )
  }

  private ensureRuntimeDropbox(): void {
    if (!this.settings.dropboxAccessToken || !this.settings.dropboxBackupRoot) return
    const existing = this.repository.get('runtime-dropbox')
    const now = new Date().toISOString()
    this.repository.save({
      id: 'runtime-dropbox',
      name: this.settings.dropboxAccountLabel.trim() || 'Runtime Dropbox',
      provider: 'dropbox',
      enabled: this.settings.dropboxEnabled,
      inMasterPool: existing?.inMasterPool ?? true,
      credentialSource: 'runtime',
      configuration: { basePath: this.settings.dropboxBackupRoot },
      credentialConfigured: true,
      executable: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }, null)
  }

  private validate(input: SaveBackupDestinationInput): void {
    if (!input.name?.trim() || input.name.trim().length > 100) throw new Error('Destination name is required and must be 100 characters or fewer.')
    if (!providers.includes(input.provider)) throw new Error('Unsupported backup destination provider.')
    const configuration = this.cleanConfiguration(input.provider, input.configuration)
    if (input.provider === 'dropbox' && !configuration.basePath) throw new Error('Dropbox base path is required.')
    if (input.provider === 'google-drive' && !configuration.folderId) throw new Error('Google Drive folder ID is required.')
    if (input.provider === 's3-compatible' && (!configuration.bucket || !configuration.region || !configuration.accessKeyId)) {
      throw new Error('Amazon/S3 bucket, region, and access key ID are required.')
    }
  }

  private cleanConfiguration(provider: BackupDestinationProvider, input: Record<string, unknown>): Record<string, string> {
    const allowed = provider === 'dropbox'
      ? ['basePath']
      : provider === 'google-drive' ? ['folderId'] : ['bucket', 'region', 'endpoint', 'basePath', 'accessKeyId']
    return Object.fromEntries(allowed.flatMap((key) => {
      const value = input[key]
      if (typeof value !== 'string' || !value.trim()) return []
      if (value.length > 500 || /[\r\n]/.test(value)) throw new Error(`Destination ${key} contains unsupported characters.`)
      return [[key, value.trim()]]
    }))
  }
}
