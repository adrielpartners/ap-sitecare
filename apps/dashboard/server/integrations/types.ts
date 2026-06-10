export type IntegrationProvider = 'cloudflare' | 'dropbox' | 'hostinger'
export type IntegrationState = 'healthy' | 'attention' | 'not-configured'

export interface IntegrationResult {
  provider: IntegrationProvider
  state: IntegrationState
  summary: string
  details: Record<string, unknown>
  checkedAt: string
}

export type Fetcher = typeof fetch
