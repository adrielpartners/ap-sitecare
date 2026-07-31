import type { Fetcher, IntegrationResult } from './types'

export interface HostingerWebsite {
  domain: string
  username: string | null
  orderId: string | null
  enabled: boolean | null
  rootDirectory: string | null
  createdAt: string | null
}

export interface HostingerWordPressInstallation {
  id: string
  domain: string
  url: string | null
  username: string | null
  valid: boolean | null
  validationError: string | null
  createdAt: string | null
}

export interface HostingerPortfolio {
  availability: 'available' | 'not-configured'
  websites: HostingerWebsite[]
  installations: HostingerWordPressInstallation[]
  wordpressInstallationsAvailability: 'available' | 'not-available'
  warnings: string[]
  checkedAt: string
}

export class HostingerApiError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus: number | null = null) {
    super(message)
  }
}

export class HostingerClient {
  constructor(
    private readonly token: string,
    private readonly apiBaseUrl: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async inspect(): Promise<IntegrationResult> {
    if (!this.configured()) {
      return {
        provider: 'hostinger',
        state: 'not-configured',
        summary: 'Hostinger API token is not configured',
        details: {
          websitesApi: 'not-configured',
          wordpressInstallationsApi: 'not-configured',
          sharedHostingDailyBackupsApi: 'not-available'
        },
        checkedAt: new Date().toISOString()
      }
    }
    try {
      const portfolio = await this.listPortfolio()
      return {
        provider: 'hostinger',
        state: portfolio.wordpressInstallationsAvailability === 'available' ? 'healthy' : 'attention',
        summary: portfolio.wordpressInstallationsAvailability === 'available'
          ? `${portfolio.websites.length} Hostinger website${portfolio.websites.length === 1 ? '' : 's'} available`
          : `${portfolio.websites.length} Hostinger website${portfolio.websites.length === 1 ? '' : 's'} available; WordPress installation details are unavailable`,
        details: {
          websiteCount: portfolio.websites.length,
          wordpressInstallationCount: portfolio.installations.length,
          websitesApi: 'available',
          wordpressInstallationsApi: portfolio.wordpressInstallationsAvailability,
          warnings: portfolio.warnings,
          sharedHostingDailyBackupsApi: 'not-available'
        },
        checkedAt: portfolio.checkedAt
      }
    } catch (error) {
      return {
        provider: 'hostinger',
        state: 'attention',
        summary: error instanceof Error ? error.message : 'Hostinger API connection needs review',
        details: {
          errorCode: error instanceof HostingerApiError ? error.code : 'hostinger-request-failed',
          httpStatus: error instanceof HostingerApiError ? error.httpStatus : null,
          sharedHostingDailyBackupsApi: 'not-available'
        },
        checkedAt: new Date().toISOString()
      }
    }
  }

  async listPortfolio(): Promise<HostingerPortfolio> {
    if (!this.configured()) {
      return {
        availability: 'not-configured', websites: [], installations: [],
        wordpressInstallationsAvailability: 'not-available', warnings: [],
        checkedAt: new Date().toISOString()
      }
    }
    const websiteRecords = await this.listCollection('/api/hosting/v1/websites')
    let installationRecords: Record<string, unknown>[] = []
    const warnings: string[] = []
    let wordpressInstallationsAvailability: HostingerPortfolio['wordpressInstallationsAvailability'] = 'available'
    try {
      installationRecords = await this.listCollection('/api/hosting/v1/wordpress/installations')
    } catch (error) {
      wordpressInstallationsAvailability = 'not-available'
      warnings.push(error instanceof Error ? error.message : 'Hostinger WordPress installations are not available.')
    }
    return {
      availability: 'available',
      websites: websiteRecords.map(record => ({
        domain: requiredProviderString(record.domain, 'Hostinger website domain'),
        username: providerString(record.username),
        orderId: providerIdentifier(record.order_id),
        enabled: providerBoolean(record.is_enabled),
        rootDirectory: providerString(record.root_directory),
        createdAt: providerDate(record.created_at)
      })),
      installations: installationRecords.map(record => ({
        id: requiredProviderString(record.id, 'Hostinger WordPress installation ID'),
        domain: requiredProviderString(record.domain, 'Hostinger WordPress domain'),
        url: providerString(record.url),
        username: providerString(record.username),
        valid: providerBoolean(record.is_valid),
        validationError: providerString(record.validation_error),
        createdAt: providerDate(record.created_at)
      })),
      wordpressInstallationsAvailability,
      warnings,
      checkedAt: new Date().toISOString()
    }
  }

  private configured(): boolean {
    return Boolean(this.token.trim() && this.apiBaseUrl.trim())
  }

  private async listCollection(path: string): Promise<Record<string, unknown>[]> {
    const records: Record<string, unknown>[] = []
    for (let page = 1; page <= 20; page += 1) {
      const separator = path.includes('?') ? '&' : '?'
      const response = await this.fetcher(
        `${this.apiBaseUrl.replace(/\/$/, '')}${path}${separator}page=${page}`,
        { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } }
      )
      const body = await response.json().catch(() => null) as unknown
      if (!response.ok) {
        const record = asRecord(body)
        const correlationId = providerString(record?.correlation_id)
        const suffix = correlationId ? ` (Hostinger correlation ${correlationId})` : ''
        throw new HostingerApiError(
          `hostinger-http-${response.status}`,
          `Hostinger API returned HTTP ${response.status}${suffix}.`,
          response.status
        )
      }
      const root = asRecord(body)
      const data = Array.isArray(body) ? body : root?.data
      if (!Array.isArray(data)) throw new HostingerApiError('hostinger-contract-invalid', 'Hostinger returned an unexpected collection response.')
      records.push(...data.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry)))
      const meta = asRecord(root?.meta)
      const lastPage = providerNumber(meta?.last_page) ?? providerNumber(meta?.lastPage)
      if ((lastPage !== null && page >= lastPage) || data.length < 50 || Array.isArray(body)) break
    }
    return records
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function providerString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredProviderString(value: unknown, label: string): string {
  const result = providerString(value)
  if (!result) throw new HostingerApiError('hostinger-contract-invalid', `${label} is missing.`)
  return result
}

function providerIdentifier(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function providerBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function providerNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function providerDate(value: unknown): string | null {
  const text = providerString(value)
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null
}
