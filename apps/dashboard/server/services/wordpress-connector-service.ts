import { createHmac, randomUUID } from 'node:crypto'
import type { Fetcher } from '../integrations/types'
import { CredentialService } from './credential-service'
import { SiteService } from './site-service'
import { WordPressUpdateService } from './wordpress-update-service'

export function createDashboardPluginSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret)
    .update(`dashboard-to-plugin.${timestamp}.${rawBody}`)
    .digest('hex')
}

export class WordPressConnectorService {
  constructor(
    private readonly credentialService: CredentialService,
    private readonly siteService = new SiteService(),
    private readonly updateService = new WordPressUpdateService(),
    private readonly fetcher: Fetcher = fetch
  ) {}

  async requestRefresh(siteId: string): Promise<{
    requestId: string
    requestedAt: string
    remoteStatus: number
  }> {
    const site = await this.siteService.get(siteId)
    if (site.status !== 'active') throw new Error('Disabled sites cannot be refreshed.')
    const connection = await this.credentialService.getConnectionSummary(siteId)
    if (!connection.activeCredential) throw new Error('The site does not have an active WordPress credential.')
    if (!connection.connection || connection.connection.contractVersion < 2) {
      throw new Error('Upgrade the AP SiteCare WordPress plugin before using remote refresh.')
    }
    const requestId = randomUUID()
    const requestedAt = new Date().toISOString()
    const rawBody = JSON.stringify({ action: 'refresh', requestId })
    const secret = await this.credentialService.getActiveSecret(siteId)
    const endpoint = new URL('/wp-json/ap-sitecare/v1/refresh', connection.connection.wordpressHomeUrl ?? site.url)
    const response = await this.fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-APSC-Site-ID': siteId,
        'X-APSC-Timestamp': requestedAt,
        'X-APSC-Dashboard-Signature': createDashboardPluginSignature(secret, requestedAt, rawBody)
      },
      body: rawBody,
      signal: AbortSignal.timeout(45_000),
      redirect: 'follow'
    })
    if (!response.ok) {
      throw new Error(`WordPress refresh endpoint returned HTTP ${response.status}.`)
    }
    const body = await response.json().catch(() => null) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body as Record<string, unknown>).ok !== true) {
      throw new Error('WordPress refresh endpoint returned an invalid response.')
    }
    return { requestId, requestedAt, remoteStatus: response.status }
  }

  async verifyRefresh(siteId: string, requestedAt: string): Promise<{
    verified: true
    checkedAt: string
    pendingUpdateCount: number
  }> {
    const detail = await this.updateService.getSiteDetail(siteId)
    if (!detail.snapshot || Date.parse(detail.snapshot.receivedAt) < Date.parse(requestedAt)) {
      throw new Error('WordPress did not report a fresh update inventory after the refresh request.')
    }
    return {
      verified: true,
      checkedAt: detail.snapshot.checkedAt,
      pendingUpdateCount: detail.snapshot.pendingUpdateCount
    }
  }
}
