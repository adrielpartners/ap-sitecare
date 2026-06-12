import type { Fetcher } from '../integrations/types'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import type { StorageProviderConfiguration } from '../domain/types'
import type { StorageObjectMetadata, StorageProvider, StorageProviderTestResult, StorageUploadResult } from './storage-provider'

const DROPBOX_API = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT_API = 'https://content.dropboxapi.com/2'
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export class DropboxStorageProvider implements StorageProvider {
  readonly type = 'dropbox' as const

  constructor(
    private readonly token: string,
    private readonly basePath: string,
    private readonly accountLabel: string,
    private readonly enabled: boolean,
    private readonly tokenStrategy: 'runtime-access-token' | 'oauth',
    private readonly fetcher: Fetcher = fetch
  ) {}

  configuration(): StorageProviderConfiguration {
    return {
      provider: this.type,
      accountLabel: this.accountLabel.trim() || null,
      basePath: this.basePath.trim() ? this.normalizedBasePath() : '',
      enabled: this.enabled,
      tokenStrategy: this.token ? this.tokenStrategy : 'not-configured',
      configured: Boolean(this.token && this.basePath)
    }
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    if (!this.enabled) {
      return this.result(Boolean(this.token && this.basePath), false, 'Dropbox backup storage is disabled.')
    }
    if (!this.token || !this.basePath) {
      return this.result(false, false, 'Dropbox access token and base folder are not configured.')
    }
    const response = await this.fetcher('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    return this.result(true, response.ok, response.ok
      ? 'Dropbox connection verified.'
      : 'Dropbox rejected the configured credential.')
  }

  artifactPath(domain: string, backupId: string): string {
    const safeDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
    const safeBackupId = backupId.replace(/[^a-zA-Z0-9-]/g, '')
    return `${this.normalizedBasePath()}/${safeDomain}/${safeBackupId}`.replace(/\/+/g, '/')
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
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: normalizedPath, include_deleted: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await this.json<{ path_display?: string, size?: number }>(response, 'Dropbox metadata lookup failed.')
    if (typeof body.size !== 'number') throw new Error('Dropbox metadata did not describe a file.')
    return { path: body.path_display ?? normalizedPath, sizeBytes: body.size }
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
    if (!this.enabled || !this.token || !this.basePath) throw new Error('Dropbox backup storage is not configured and enabled.')
  }

  private contentRequest(endpoint: string, argument: Record<string, unknown>, body: Buffer): Promise<Response> {
    return this.fetcher(`${DROPBOX_CONTENT_API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
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
}
