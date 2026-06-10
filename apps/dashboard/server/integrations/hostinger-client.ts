import type { Fetcher, IntegrationResult } from './types'

export class HostingerClient {
  constructor(
    private readonly token: string,
    private readonly apiBaseUrl: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async inspect(): Promise<IntegrationResult> {
    if (!this.token || !this.apiBaseUrl) {
      return {
        provider: 'hostinger',
        state: 'not-configured',
        summary: 'Hostinger API token and base URL are not configured',
        details: {},
        checkedAt: new Date().toISOString()
      }
    }

    const response = await this.fetcher(`${this.apiBaseUrl.replace(/\/$/, '')}/api/billing/v1/subscriptions`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }
    })
    return {
      provider: 'hostinger',
      state: response.ok ? 'healthy' : 'attention',
      summary: response.ok ? 'Hostinger API connection is available' : 'Hostinger API connection needs review',
      details: { httpStatus: response.status },
      checkedAt: new Date().toISOString()
    }
  }
}
