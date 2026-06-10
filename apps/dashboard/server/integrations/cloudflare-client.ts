import type { Fetcher, IntegrationResult } from './types'

interface CloudflareResponse {
  success?: boolean
  result?: Array<{ id?: string, name?: string, status?: string, paused?: boolean }>
}

interface CloudflareDnsResponse {
  Status?: number
  Answer?: Array<{ data?: string }>
}

export class CloudflareClient {
  constructor(private readonly token: string, private readonly fetcher: Fetcher = fetch) {}

  async inspect(domain: string): Promise<IntegrationResult> {
    if (!this.token) return this.inspectPublicDns(domain)
    const response = await this.fetcher(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    })
    if (!response.ok) throw new Error(`Cloudflare API request failed with status ${response.status}.`)
    const body = await response.json() as CloudflareResponse
    const zone = body.result?.[0]
    const healthy = body.success === true && zone?.status === 'active' && zone.paused !== true
    return {
      provider: 'cloudflare',
      state: healthy ? 'healthy' : 'attention',
      summary: healthy ? 'Cloudflare zone is active' : 'Cloudflare zone needs review',
      details: { zoneId: zone?.id ?? null, zoneStatus: zone?.status ?? null, paused: zone?.paused ?? null },
      checkedAt: new Date().toISOString()
    }
  }

  private async inspectPublicDns(domain: string): Promise<IntegrationResult> {
    const response = await this.fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { Accept: 'application/dns-json' }
    })
    if (!response.ok) throw new Error(`Cloudflare DNS request failed with status ${response.status}.`)
    const body = await response.json() as CloudflareDnsResponse
    const resolved = body.Status === 0 && Boolean(body.Answer?.length)
    return {
      provider: 'cloudflare',
      state: resolved ? 'healthy' : 'attention',
      summary: resolved ? 'Domain resolves through Cloudflare DNS' : 'Domain did not resolve through Cloudflare DNS',
      details: { mode: 'public-dns', answerCount: body.Answer?.length ?? 0 },
      checkedAt: new Date().toISOString()
    }
  }
}
