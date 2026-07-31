import type { Fetcher, IntegrationResult } from './types'

interface CloudflareEnvelope<Result> {
  success?: boolean
  result?: Result
  errors?: Array<{ code?: number, message?: string }>
}

export interface CloudflareZone {
  id: string
  name: string
  status: string
  paused: boolean
  account?: { id?: string, name?: string }
}

export interface CloudflareHealthCheck {
  id: string
  name: string
  status: 'healthy' | 'unhealthy' | 'unknown' | 'suspended' | string
  failure_reason?: string
  interval: number
  consecutive_fails: number
  consecutive_successes: number
  suspended?: boolean
  address?: string
  type?: string
}

export interface CloudflareHealthCheckInput {
  name: string
  address: string
  type: 'HTTPS' | 'HTTP'
  port: number
  interval: number
  consecutiveFails: number
  consecutiveSuccesses: number
  path: string
}

export interface CloudflareSecurityApiSnapshot {
  zone: CloudflareZone
  dnsRecords: Array<{ name?: string, type?: string, proxied?: boolean, proxiable?: boolean }>
  settings: Array<{ id?: string, value?: unknown, editable?: boolean, modified_on?: string }>
  dnssec: Record<string, unknown> | null
  universalSsl: Record<string, unknown> | null
  botManagement: Record<string, unknown> | null
  managedRuleset: Record<string, unknown> | null
  cacheRuleset: Record<string, unknown> | null
  capabilities: Record<string, 'available' | 'unavailable'>
}

export interface CloudflareNotificationReadiness {
  healthCheckNotificationAvailable: boolean
  webhookDestinationConfigured: boolean
  notificationPolicyConfigured: boolean
  webhookDestination: Record<string, unknown> | null
  notificationPolicy: Record<string, unknown> | null
}

interface CloudflareDnsResponse {
  Status?: number
  Answer?: Array<{ data?: string }>
}

export class CloudflareApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null = null) {
    super(message)
    this.name = 'CloudflareApiError'
  }
}

export class CloudflareClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly apiBaseUrl = 'https://api.cloudflare.com/client/v4'
  ) {}

  configured(): boolean {
    return Boolean(this.token.trim())
  }

  async inspect(domain: string): Promise<IntegrationResult> {
    if (!this.token) return this.inspectPublicDns(domain)
    const zone = await this.findZone(domain)
    const healthy = zone?.status === 'active' && zone.paused !== true
    return {
      provider: 'cloudflare',
      state: healthy ? 'healthy' : 'attention',
      summary: healthy ? 'Cloudflare zone is active' : zone ? 'Cloudflare zone needs review' : 'Cloudflare zone was not found',
      details: { zoneId: zone?.id ?? null, zoneStatus: zone?.status ?? null, paused: zone?.paused ?? null },
      checkedAt: new Date().toISOString()
    }
  }

  async findZone(domain: string): Promise<CloudflareZone | null> {
    this.requireConfigured()
    for (const candidate of zoneCandidates(domain)) {
      const zones = await this.request<CloudflareZone[]>(`/zones?name=${encodeURIComponent(candidate)}`)
      const exact = zones.find(zone => normalizeDomain(zone.name) === candidate)
      if (exact) return exact
    }
    return null
  }

  async listHealthChecks(zoneId: string): Promise<CloudflareHealthCheck[]> {
    return this.request(`/zones/${encodeURIComponent(zoneId)}/healthchecks`)
  }

  async getHealthCheck(zoneId: string, healthCheckId: string): Promise<CloudflareHealthCheck> {
    return this.request(`/zones/${encodeURIComponent(zoneId)}/healthchecks/${encodeURIComponent(healthCheckId)}`)
  }

  async createHealthCheck(zoneId: string, input: CloudflareHealthCheckInput): Promise<CloudflareHealthCheck> {
    return this.request(`/zones/${encodeURIComponent(zoneId)}/healthchecks`, {
      method: 'POST',
      body: JSON.stringify(healthCheckPayload(input))
    })
  }

  async updateHealthCheck(
    zoneId: string,
    healthCheckId: string,
    input: Partial<CloudflareHealthCheckInput> & { suspended?: boolean }
  ): Promise<CloudflareHealthCheck> {
    const payload: Record<string, unknown> = {}
    if (input.interval !== undefined) payload.interval = input.interval
    if (input.consecutiveFails !== undefined) payload.consecutive_fails = input.consecutiveFails
    if (input.consecutiveSuccesses !== undefined) payload.consecutive_successes = input.consecutiveSuccesses
    if (input.suspended !== undefined) payload.suspended = input.suspended
    if (input.address !== undefined) payload.address = input.address
    if (input.name !== undefined) payload.name = input.name
    if (input.type !== undefined) payload.type = input.type
    if (input.port !== undefined) payload.port = input.port
    if (input.path !== undefined) {
      payload.http_config = {
        allow_insecure: false,
        expected_codes: ['2xx'],
        follow_redirects: true,
        header: {},
        method: 'GET',
        path: input.path
      }
    }
    return this.request(`/zones/${encodeURIComponent(zoneId)}/healthchecks/${encodeURIComponent(healthCheckId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  }

  async securitySnapshot(zone: CloudflareZone): Promise<CloudflareSecurityApiSnapshot> {
    const capabilities: CloudflareSecurityApiSnapshot['capabilities'] = {}
    const optional = async <Result>(name: string, path: string): Promise<Result | null> => {
      try {
        const result = await this.request<Result>(path)
        capabilities[name] = 'available'
        return result
      } catch (error) {
        if (error instanceof CloudflareApiError && [400, 403, 404].includes(error.status)) {
          capabilities[name] = 'unavailable'
          return null
        }
        throw error
      }
    }
    const zoneId = encodeURIComponent(zone.id)
    const [dnsRecords, settings, dnssec, universalSsl, botManagement, managedRuleset, cacheRuleset] = await Promise.all([
      optional<Array<{ name?: string, type?: string, proxied?: boolean, proxiable?: boolean }>>('dns-records', `/zones/${zoneId}/dns_records?per_page=500`),
      optional<Array<{ id?: string, value?: unknown, editable?: boolean, modified_on?: string }>>('zone-settings', `/zones/${zoneId}/settings`),
      optional<Record<string, unknown>>('dnssec', `/zones/${zoneId}/dnssec`),
      optional<Record<string, unknown>>('universal-ssl', `/zones/${zoneId}/ssl/universal/settings`),
      optional<Record<string, unknown>>('bot-management', `/zones/${zoneId}/bot_management`),
      optional<Record<string, unknown>>('managed-rules', `/zones/${zoneId}/rulesets/phases/http_request_firewall_managed/entrypoint`),
      optional<Record<string, unknown>>('cache-rules', `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`)
    ])
    return {
      zone,
      dnsRecords: dnsRecords ?? [],
      settings: settings ?? [],
      dnssec,
      universalSsl,
      botManagement,
      managedRuleset,
      cacheRuleset,
      capabilities
    }
  }

  async notificationReadiness(
    accountId: string,
    webhookDestinationId: string,
    notificationPolicyId: string
  ): Promise<CloudflareNotificationReadiness> {
    const account = encodeURIComponent(accountId)
    const available = await this.request<unknown>(`/accounts/${account}/alerting/v3/available_alerts`)
    const optional = async (path: string): Promise<Record<string, unknown> | null> => {
      try {
        return await this.request<Record<string, unknown>>(path)
      } catch (error) {
        if (error instanceof CloudflareApiError && [400, 403, 404].includes(error.status)) return null
        throw error
      }
    }
    const [webhookDestination, notificationPolicy] = await Promise.all([
      webhookDestinationId
        ? optional(`/accounts/${account}/alerting/v3/destinations/webhooks/${encodeURIComponent(webhookDestinationId)}`)
        : null,
      notificationPolicyId
        ? optional(`/accounts/${account}/alerting/v3/policies/${encodeURIComponent(notificationPolicyId)}`)
        : null
    ])
    const policyText = JSON.stringify(notificationPolicy ?? {}).toLowerCase()
    return {
      healthCheckNotificationAvailable: JSON.stringify(available).includes('health_check_status_notification'),
      webhookDestinationConfigured: Boolean(webhookDestination),
      notificationPolicyConfigured: Boolean(notificationPolicy)
        && policyText.includes('health_check_status_notification')
        && notificationPolicy?.enabled !== false,
      webhookDestination,
      notificationPolicy
    }
  }

  private async request<Result>(path: string, init: RequestInit = {}): Promise<Result> {
    this.requireConfigured()
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init.headers
      }
    })
    let body: CloudflareEnvelope<Result> | null = null
    try {
      body = await response.json() as CloudflareEnvelope<Result>
    } catch {
      // Normalize non-JSON provider errors below.
    }
    if (!response.ok || body?.success === false || body?.result === undefined) {
      const providerError = body?.errors?.[0]
      throw new CloudflareApiError(
        providerError?.message || `Cloudflare API request failed with status ${response.status}.`,
        response.status,
        providerError?.code ?? null
      )
    }
    return body.result
  }

  private requireConfigured(): void {
    if (!this.token.trim()) throw new CloudflareApiError('Cloudflare API access is not configured.', 503)
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

function healthCheckPayload(input: CloudflareHealthCheckInput): Record<string, unknown> {
  return {
    name: input.name,
    address: input.address,
    type: input.type,
    port: input.port,
    interval: input.interval,
    consecutive_fails: input.consecutiveFails,
    consecutive_successes: input.consecutiveSuccesses,
    retries: 0,
    suspended: false,
    http_config: {
      allow_insecure: false,
      expected_codes: ['2xx'],
      follow_redirects: true,
      header: {},
      method: 'GET',
      path: input.path
    }
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
}

function zoneCandidates(value: string): string[] {
  const labels = normalizeDomain(value).split('.').filter(Boolean)
  const candidates: string[] = []
  for (let index = 0; index <= Math.max(0, labels.length - 2); index += 1) {
    candidates.push(labels.slice(index).join('.'))
  }
  return [...new Set(candidates)]
}
