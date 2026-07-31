import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { BackupDestination, BackupDestinationMode, BackupDestinationProvider, SiteBackupDestinationSettings } from '../domain/types'
import { BackupDestinationRepository } from '../repositories/backup-destination-repository'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import { DropboxOAuthClient } from '../integrations/dropbox-oauth-client'

const providers: BackupDestinationProvider[] = ['dropbox', 'google-drive', 's3-compatible']

export interface BackupDestinationRuntimeSettings {
  credentialEncryptionKey: string
  dropboxAccessToken: string
  dropboxRefreshToken?: string
  dropboxAppKey?: string
  dropboxAppSecret?: string
  dropboxRedirectUri?: string
  sitecareBaseUrl?: string
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

  async list(): Promise<BackupDestination[]> {
    await this.ensureRuntimeDropbox()
    return this.repository.list()
  }

  async save(input: SaveBackupDestinationInput, actorIdentifier: string): Promise<BackupDestination> {
    this.validate(input)
    const existing = input.id ? await this.repository.get(input.id) : null
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
      credentialConfigured: Boolean(
        input.credential || (existing && await this.repository.getCredentialCiphertext(existing.id))
      ),
      executable: input.provider === 'dropbox',
      lastTestedAt: existing?.lastTestedAt ?? null,
      lastConnectionStatus: existing?.lastConnectionStatus ?? null,
      lastErrorCode: existing?.lastErrorCode ?? null,
      lastErrorMessage: existing?.lastErrorMessage ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const credentialCiphertext = input.credential
      ? encryptSecret(input.credential, this.settings.credentialEncryptionKey)
      : existing ? await this.repository.getCredentialCiphertext(existing.id) : null
    await this.repository.save(destination, credentialCiphertext)
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: existing ? 'backup.destination.updated' : 'backup.destination.created',
      metadata: { destinationId: destination.id, provider: destination.provider, enabled: destination.enabled, inMasterPool: destination.inMasterPool }
    })
    return destination
  }

  async test(id: string, actorIdentifier: string) {
    const destination = (await this.list()).find(item => item.id === id)
    if (!destination) throw new Error('Backup destination not found.')
    const result = destination.provider === 'dropbox'
      ? await (await this.dropbox(destination)).testConnection()
      : {
          provider: destination.provider,
          configured: destination.credentialConfigured,
          connected: false,
          message: `${destination.name} is saved, but its execution adapter is not implemented yet.`,
          checkedAt: new Date().toISOString()
        }
    const testedAt = result.checkedAt
    await this.repository.recordConnectionResult(
      destination.id,
      result.connected ? 'connected' : 'failed',
      result.connected ? null : 'connection-test-failed',
      result.connected ? null : result.message,
      testedAt
    )
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.destination.tested',
      metadata: { destinationId: destination.id, provider: destination.provider, connected: result.connected }
    })
    return result
  }

  async getSiteSettings(siteId: string): Promise<SiteBackupDestinationSettings> {
    await this.sites.get(siteId)
    const settings = await this.repository.getSiteSettings(siteId)
    return {
      siteId,
      ...settings,
      effectiveDestinations: await this.resolveForSite(siteId)
    }
  }

  async saveSiteSettings(
    siteId: string,
    mode: BackupDestinationMode,
    allowMultiple: boolean,
    destinationIds: string[],
    actorIdentifier: string
  ): Promise<SiteBackupDestinationSettings> {
    await this.sites.get(siteId)
    if (!['master', 'override'].includes(mode)) throw new Error('Unsupported backup destination mode.')
    const uniqueIds = [...new Set(destinationIds)]
    const destinations = await this.list()
    if (uniqueIds.some(id => !destinations.some(destination => destination.id === id))) throw new Error('A selected backup destination was not found.')
    if (mode === 'override' && !uniqueIds.length) throw new Error('Select at least one site-specific backup destination.')
    if (allowMultiple || uniqueIds.length > 1) {
      throw new Error('SiteCare Pro currently supports exactly one independent off-site backup destination per site.')
    }
    await this.repository.saveSiteSettings(
      siteId,
      mode,
      allowMultiple,
      mode === 'override' ? uniqueIds : [],
      new Date().toISOString()
    )
    await this.audit.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.site-destinations.updated',
      metadata: {
        mode,
        allowMultiple,
        destinationCount: mode === 'override'
          ? uniqueIds.length
          : (await this.resolveForSite(siteId)).length
      }
    })
    return this.getSiteSettings(siteId)
  }

  async resolveForSite(siteId: string): Promise<BackupDestination[]> {
    const settings = await this.repository.getSiteSettings(siteId)
    const destinations = (await this.list()).filter(destination => destination.enabled)
    const selected = settings.mode === 'override'
      ? settings.destinationIds.map(id => destinations.find(destination => destination.id === id)).filter(Boolean) as BackupDestination[]
      : destinations.filter(destination => destination.inMasterPool)
    return selected.slice(0, 1)
  }

  async credential(destination: BackupDestination): Promise<string> {
    if (destination.credentialSource === 'runtime') {
      return destination.configuration.authMode === 'oauth-refresh-token'
        ? this.settings.dropboxRefreshToken ?? ''
        : this.settings.dropboxAccessToken
    }
    const ciphertext = await this.repository.getCredentialCiphertext(destination.id)
    if (!ciphertext) throw new Error(`${destination.name} does not have a configured credential.`)
    return decryptSecret(ciphertext, this.settings.credentialEncryptionKey)
  }

  async dropbox(destination: BackupDestination): Promise<DropboxStorageProvider> {
    if (destination.provider !== 'dropbox') throw new Error(`${destination.name} does not have an executable backup adapter yet.`)
    const credential = await this.credential(destination)
    const oauth = destination.configuration.authMode === 'oauth-refresh-token'
      ? {
          appKey: this.settings.dropboxAppKey ?? '',
          appSecret: this.settings.dropboxAppSecret ?? '',
          refreshToken: credential
        }
      : undefined
    return new DropboxStorageProvider(
      oauth ? '' : credential,
      destination.configuration.basePath ?? '',
      destination.name,
      destination.enabled,
      oauth ? 'oauth' : 'runtime-access-token',
      fetch,
      oauth
    )
  }

  async beginDropboxOAuth(destinationId: string, actorIdentifier: string): Promise<{ authorizationUrl: string }> {
    const destination = await this.repository.get(destinationId)
    if (!destination || destination.provider !== 'dropbox') throw new Error('Dropbox destination not found.')
    if (destination.credentialSource === 'runtime') throw new Error('Runtime Dropbox credentials must be changed through deployment settings.')
    const state = randomBytes(32).toString('base64url')
    const now = new Date()
    await this.repository.createOAuthState({
      stateHash: hashState(state),
      destinationId,
      initiatedBy: actorIdentifier,
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      createdAt: now.toISOString()
    })
    const client = this.oauthClient()
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.destination.oauth-started',
      metadata: { destinationId, provider: 'dropbox' }
    })
    return { authorizationUrl: client.authorizationUrl(state) }
  }

  async completeDropboxOAuth(code: string, state: string): Promise<BackupDestination> {
    if (!code.trim() || !state.trim()) throw new Error('Dropbox authorization response is incomplete.')
    const consumedAt = new Date().toISOString()
    const pending = await this.repository.consumeOAuthState(hashState(state), consumedAt)
    if (!pending) throw new Error('Dropbox authorization state is invalid or expired.')
    const destination = await this.repository.get(pending.destinationId)
    if (!destination || destination.provider !== 'dropbox' || destination.credentialSource === 'runtime') {
      throw new Error('Dropbox destination is no longer available for authorization.')
    }
    const credential = await this.oauthClient().exchangeCode(code)
    const connected: BackupDestination = {
      ...destination,
      configuration: {
        ...destination.configuration,
        authMode: 'oauth-refresh-token',
        ...(credential.accountId ? { accountId: credential.accountId } : {})
      },
      credentialConfigured: true,
      lastTestedAt: null,
      lastConnectionStatus: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: consumedAt
    }
    await this.repository.save(connected, encryptSecret(credential.refreshToken, this.settings.credentialEncryptionKey))
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier: pending.initiatedBy,
      eventType: 'backup.destination.oauth-connected',
      metadata: { destinationId: destination.id, provider: 'dropbox' }
    })
    return connected
  }

  private async ensureRuntimeDropbox(): Promise<void> {
    if ((!this.settings.dropboxAccessToken && !this.settings.dropboxRefreshToken) || !this.settings.dropboxBackupRoot) return
    const existing = await this.repository.get('runtime-dropbox')
    const now = new Date().toISOString()
    await this.repository.save({
      id: 'runtime-dropbox',
      name: this.settings.dropboxAccountLabel.trim() || 'Runtime Dropbox',
      provider: 'dropbox',
      enabled: this.settings.dropboxEnabled,
      inMasterPool: existing?.inMasterPool ?? true,
      credentialSource: 'runtime',
      configuration: {
        basePath: this.settings.dropboxBackupRoot,
        authMode: this.settings.dropboxRefreshToken ? 'oauth-refresh-token' : 'access-token'
      },
      credentialConfigured: true,
      executable: true,
      lastTestedAt: existing?.lastTestedAt ?? null,
      lastConnectionStatus: existing?.lastConnectionStatus ?? null,
      lastErrorCode: existing?.lastErrorCode ?? null,
      lastErrorMessage: existing?.lastErrorMessage ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }, null)
  }

  private validate(input: SaveBackupDestinationInput): void {
    if (!input.name?.trim() || input.name.trim().length > 100) throw new Error('Destination name is required and must be 100 characters or fewer.')
    if (!providers.includes(input.provider)) throw new Error('Unsupported backup destination provider.')
    const configuration = this.cleanConfiguration(input.provider, input.configuration)
    if (input.provider === 'dropbox' && !configuration.basePath) throw new Error('Dropbox base path is required.')
    if (input.provider === 'dropbox' && configuration.authMode
      && !['access-token', 'oauth-refresh-token'].includes(configuration.authMode)) {
      throw new Error('Unsupported Dropbox authorization mode.')
    }
    if (input.provider === 'dropbox' && !input.id && !input.credential?.trim()
      && configuration.authMode !== 'oauth-refresh-token') throw new Error('Dropbox access token is required, or choose OAuth and connect after saving.')
    if (input.provider === 'google-drive' && !configuration.folderId) throw new Error('Google Drive folder ID is required.')
    if (input.provider === 's3-compatible' && (!configuration.bucket || !configuration.region || !configuration.accessKeyId)) {
      throw new Error('Amazon/S3 bucket, region, and access key ID are required.')
    }
  }

  private cleanConfiguration(provider: BackupDestinationProvider, input: Record<string, unknown>): Record<string, string> {
    const allowed = provider === 'dropbox'
      ? ['basePath', 'authMode', 'accountId']
      : provider === 'google-drive' ? ['folderId'] : ['bucket', 'region', 'endpoint', 'basePath', 'accessKeyId']
    return Object.fromEntries(allowed.flatMap((key) => {
      const value = input[key]
      if (typeof value !== 'string' || !value.trim()) return []
      if (value.length > 500 || /[\r\n]/.test(value)) throw new Error(`Destination ${key} contains unsupported characters.`)
      return [[key, value.trim()]]
    }))
  }

  private oauthClient(): DropboxOAuthClient {
    const redirectUri = this.settings.dropboxRedirectUri
      || `${(this.settings.sitecareBaseUrl || 'http://localhost:3000').replace(/\/$/, '')}/api/backup-destinations/oauth/callback`
    return new DropboxOAuthClient(
      this.settings.dropboxAppKey ?? '',
      this.settings.dropboxAppSecret ?? '',
      redirectUri
    )
  }
}

function hashState(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
