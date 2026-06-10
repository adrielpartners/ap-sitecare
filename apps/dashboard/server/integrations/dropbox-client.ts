import type { Fetcher, IntegrationResult } from './types'

export class DropboxClient {
  constructor(
    private readonly token: string,
    private readonly backupRoot: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async inspect(domain: string): Promise<IntegrationResult> {
    if (!this.token || !this.backupRoot) {
      return {
        provider: 'dropbox',
        state: 'not-configured',
        summary: 'Dropbox token and backup root are required',
        details: {},
        checkedAt: new Date().toISOString()
      }
    }

    const path = `${this.backupRoot.replace(/\/$/, '')}/${domain}`
    const response = await this.fetcher('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, include_deleted: false })
    })
    return {
      provider: 'dropbox',
      state: response.ok ? 'healthy' : 'attention',
      summary: response.ok ? 'Dropbox backup location exists' : 'Dropbox backup location was not verified',
      details: { path, httpStatus: response.status },
      checkedAt: new Date().toISOString()
    }
  }
}
