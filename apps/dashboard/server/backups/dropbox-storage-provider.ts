import type { Fetcher } from '../integrations/types'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import type { StorageProviderConfiguration } from '../domain/types'
import type { StorageObjectMetadata, StorageProvider, StorageProviderTestResult, StorageUploadResult } from './storage-provider'

const DROPBOX_API = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT_API = 'https://content.dropboxapi.com/2'
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export interface DropboxOAuthRefreshConfiguration {
  appKey: string
  appSecret: string
  refreshToken: string
}

export class DropboxStorageProvider implements StorageProvider {
  readonly type = 'dropbox' as const
  private refreshedAccessToken: { value: string, expiresAt: number } | null = null

  constructor(
    private readonly token: string,
    private readonly basePath: string,
    private readonly accountLabel: string,
    private readonly enabled: boolean,
    private readonly tokenStrategy: 'runtime-access-token' | 'oauth',
    private readonly fetcher: Fetcher = fetch,
    private readonly oauth?: DropboxOAuthRefreshConfiguration
  ) {}

  configuration(): StorageProviderConfiguration {
    return {
      provider: this.type,
      accountLabel: this.accountLabel.trim() || null,
      basePath: this.basePath.trim() ? this.normalizedBasePath() : '',
      enabled: this.enabled,
      tokenStrategy: this.hasCredential() ? this.tokenStrategy : 'not-configured',
      configured: Boolean(this.hasCredential() && this.basePath)
    }
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    if (!this.enabled) {
      return this.result(Boolean(this.hasCredential() && this.basePath), false, 'Dropbox backup storage is disabled.')
    }
    if (!this.hasCredential() || !this.basePath) {
      return this.result(false, false, 'Dropbox OAuth credential or access token and base folder are not configured.')
    }
    const authorization = await this.authorizationHeader()
    const metadataResponse = await this.fetcher(`${DROPBOX_API}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: '', limit: 1 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const writeResponse = metadataResponse.ok
      ? await this.fetcher(`${DROPBOX_CONTENT_API}/files/upload_session/start`, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Dropbox-API-Arg': JSON.stringify({ close: true }),
            'Content-Type': 'application/octet-stream'
          },
          body: new ArrayBuffer(0),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      : null
    const connected = metadataResponse.ok && Boolean(writeResponse?.ok)
    return this.result(true, connected, connected
      ? 'Dropbox connection and required backup permissions verified.'
      : 'Dropbox rejected the credential or required files.metadata.read/files.content.write permissions.')
  }

  artifactPath(clientFolder: string, backupId: string, timestamp: string | Date = new Date()): string {
    const safeClientFolder = clientFolder.trim().replace(/[\\/\u0000-\u001f]/g, '-').replace(/^\.+$/, '-')
    const safeBackupId = backupId.replace(/[^a-zA-Z0-9-]/g, '')
    if (!safeClientFolder) throw new Error('Dropbox client folder is required.')
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
    if (Number.isNaN(date.getTime())) throw new Error('Backup timestamp is invalid.')
    const year = String(date.getUTCFullYear())
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${this.normalizedBasePath()}/${safeClientFolder}/${year}/${month}/${safeBackupId}`.replace(/\/+/g, '/')
  }

  destinationPath(directory: string, fileName: string): string {
    const normalizedDirectory = this.normalizeDestinationPath(directory)
    const safeName = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-')
    if (!safeName || safeName === '.' || safeName === '..') throw new Error('Dropbox destination filename is invalid.')
    return `${normalizedDirectory}/${safeName}`
  }

  async upload(localPath: string, destinationPath: string): Promise<StorageUploadResult> {
    this.requireConfigured()
    const destination = this.normalizeDestinationPath(destinationPath)
    const file = await open(localPath, 'r')
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size < 1) throw new Error('Backup upload source must be a non-empty file.')
      const firstSize = Math.min(UPLOAD_CHUNK_BYTES, stat.size)
      const first = Buffer.alloc(firstSize)
      await file.read(first, 0, firstSize, 0)
      const start = await this.contentRequest('/files/upload_session/start', { close: false }, first)
      const startBody = await this.json<{ session_id?: string }>(start, 'Dropbox could not start the upload.')
      if (!startBody.session_id) throw new Error('Dropbox did not return an upload session.')

      let offset = firstSize
      while (offset < stat.size) {
        const chunkSize = Math.min(UPLOAD_CHUNK_BYTES, stat.size - offset)
        const chunk = Buffer.alloc(chunkSize)
        await file.read(chunk, 0, chunkSize, offset)
        const final = offset + chunkSize === stat.size
        const response = final
          ? await this.contentRequest('/files/upload_session/finish', {
              cursor: { session_id: startBody.session_id, offset },
              commit: { path: destination, mode: 'overwrite', autorename: false, mute: true, strict_conflict: false }
            }, chunk)
          : await this.contentRequest('/files/upload_session/append_v2', {
              cursor: { session_id: startBody.session_id, offset },
              close: false
            }, chunk)
        if (!response.ok) throw new Error(final ? 'Dropbox could not complete the upload.' : 'Dropbox could not append the upload.')
        offset += chunkSize
      }

      if (firstSize === stat.size) {
        const finish = await this.contentRequest('/files/upload_session/finish', {
          cursor: { session_id: startBody.session_id, offset: firstSize },
          commit: { path: destination, mode: 'overwrite', autorename: false, mute: true, strict_conflict: false }
        }, Buffer.alloc(0))
        if (!finish.ok) throw new Error('Dropbox could not complete the upload.')
      }
      const metadata = await this.getMetadata(destination)
      return { ...metadata, verified: metadata.sizeBytes === stat.size }
    } finally {
      await file.close()
    }
  }

  async getMetadata(path: string): Promise<StorageObjectMetadata> {
    this.requireConfigured()
    const normalizedPath = this.normalizeDestinationPath(path)
    const response = await this.fetcher(`${DROPBOX_API}/files/get_metadata`, {
      method: 'POST',
      headers: {
        Authorization: await this.authorizationHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: normalizedPath, include_deleted: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await this.json<{ path_display?: string, size?: number }>(response, 'Dropbox metadata lookup failed.')
    if (typeof body.size !== 'number') throw new Error('Dropbox metadata did not describe a file.')
    return { path: body.path_display ?? normalizedPath, sizeBytes: body.size }
  }

  async temporaryLink(path: string): Promise<string> {
    this.requireConfigured()
    const response = await this.fetcher(`${DROPBOX_API}/files/get_temporary_link`, {
      method: 'POST',
      headers: {
        Authorization: await this.authorizationHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: this.normalizeDestinationPath(path) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await this.json<{ link?: string }>(response, 'Dropbox could not create a temporary download link.')
    if (!body.link) throw new Error('Dropbox did not return a temporary download link.')
    return body.link
  }

  async delete(path: string): Promise<void> {
    this.requireConfigured()
    const response = await this.fetcher(`${DROPBOX_API}/files/delete_v2`, {
      method: 'POST',
      headers: {
        Authorization: await this.authorizationHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: this.normalizeDestinationPath(path) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error('Dropbox could not delete the expired backup object.')
  }

  private normalizedBasePath(): string {
    return this.normalizeDestinationPath(this.basePath)
  }

  private normalizeDestinationPath(value: string): string {
    const normalized = `/${value.trim()}`.replace(/\/+/g, '/').replace(/\/+$/, '')
    if (!normalized || normalized === '/' || normalized.split('/').some(segment => segment === '..' || segment === '.')) {
      throw new Error('Dropbox destination path is invalid.')
    }
    return normalized
  }

  private requireConfigured(): void {
    if (!this.enabled || !this.hasCredential() || !this.basePath) throw new Error('Dropbox backup storage is not configured and enabled.')
  }

  private async contentRequest(endpoint: string, argument: Record<string, unknown>, body: Buffer): Promise<Response> {
    return this.fetcher(`${DROPBOX_CONTENT_API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: await this.authorizationHeader(),
        'Dropbox-API-Arg': JSON.stringify(argument),
        'Content-Type': 'application/octet-stream'
      },
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  }

  private async json<T>(response: Response, message: string): Promise<T> {
    if (!response.ok) throw new Error(message)
    return await response.json() as T
  }

  private result(configured: boolean, connected: boolean, message: string): StorageProviderTestResult {
    return { provider: this.type, configured, connected, message, checkedAt: new Date().toISOString() }
  }

  private hasCredential(): boolean {
    return Boolean(this.token || (this.oauth?.appKey && this.oauth.appSecret && this.oauth.refreshToken))
  }

  private async authorizationHeader(): Promise<string> {
    if (!this.oauth) {
      if (!this.token) throw new Error('Dropbox access token is not configured.')
      return `Bearer ${this.token}`
    }
    if (this.refreshedAccessToken && this.refreshedAccessToken.expiresAt > Date.now() + 60_000) {
      return `Bearer ${this.refreshedAccessToken.value}`
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.oauth.refreshToken
    })
    const response = await this.fetcher('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.oauth.appKey}:${this.oauth.appSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const token = await this.json<{ access_token?: string, expires_in?: number }>(response, 'Dropbox OAuth refresh failed; reconnect the destination.')
    if (!token.access_token) throw new Error('Dropbox OAuth refresh did not return an access token.')
    this.refreshedAccessToken = {
      value: token.access_token,
      expiresAt: Date.now() + Math.max(300, token.expires_in ?? 14_400) * 1000
    }
    return `Bearer ${token.access_token}`
  }
}
