export type CloudflareConnectionAvailability =
  | 'available'
  | 'not-found'
  | 'not-configured'
  | 'not-synchronized'
  | 'provider-error'

export interface CloudflareSiteConnection {
  siteId: string
  zoneId: string | null
  zoneName: string | null
  accountId: string | null
  availability: CloudflareConnectionAvailability
  homepageUrl: string
  healthCheckId: string | null
  healthCheckName: string | null
  healthCheckStatus: string | null
  normalIntervalSeconds: number
  alertFailureThreshold: number
  capabilities: Record<string, unknown>
  lastSyncedAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type UptimeMonitorStatus =
  | 'not-configured'
  | 'disabled'
  | 'healthy'
  | 'first-failure'
  | 'incident'
  | 'maintenance'
  | 'provider-error'

export interface UptimeMonitorState {
  siteId: string
  status: UptimeMonitorStatus
  consecutiveFailures: number
  firstFailureAt: string | null
  firstFailureProviderEventId: string | null
  lastFailureAt: string | null
  lastFailureReason: string | null
  lastSuccessAt: string | null
  currentIntervalSeconds: number
  activeIncidentId: string | null
  lastReconciledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UptimeIncident {
  id: string
  siteId: string
  healthCheckId: string | null
  status: 'open' | 'recovered'
  startedAt: string
  confirmedAt: string
  recoveredAt: string | null
  durationSeconds: number | null
  failureCount: number
  initialReason: string | null
  finalReason: string | null
  recoveryNotes: string | null
  restoredBackupReference: string | null
  alertQueuedAt: string | null
  recoveryReportQueuedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UptimeObservation {
  id: string
  siteId: string
  incidentId: string | null
  providerEventId: string | null
  source: 'cloudflare-webhook' | 'cloudflare-reconciliation'
  status: 'healthy' | 'unhealthy' | 'tls-error' | 'unknown' | 'maintenance'
  reason: string | null
  excludedFromDowntime: boolean
  observedAt: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface UptimeMaintenanceWindow {
  id: string
  siteId: string
  startsAt: string
  endsAt: string
  reason: string
  createdBy: string
  cancelledAt: string | null
  cancelledBy: string | null
  createdAt: string
  updatedAt: string
}

export const cloudflareSecurityControlDefinitions = [
  { key: 'proxy-cdn', label: 'Cloudflare proxy and Global CDN' },
  { key: 'automatic-https-rewrites', label: 'Automatic HTTPS Rewrites' },
  { key: 'always-use-https', label: 'Always Use HTTPS' },
  { key: 'opportunistic-encryption', label: 'Opportunistic Encryption' },
  { key: 'brotli', label: 'Cloudflare-managed compression' },
  { key: 'http3', label: 'HTTP/3' },
  { key: 'apo', label: 'Automatic Platform Optimization (when applicable)' },
  { key: 'browser-integrity-check', label: 'Browser Integrity Check' },
  { key: 'bot-fight-mode', label: 'Bot Fight Mode' },
  { key: 'waf-managed-rules', label: 'WAF with Cloudflare Managed Rules' },
  { key: 'ddos-protection', label: 'Cloudflare DDoS protection' },
  { key: 'dnssec', label: 'DNSSEC (where supported)' },
  { key: 'universal-ssl', label: 'Universal SSL' },
  { key: 'standard-caching', label: 'Standard caching without a site-wide bypass' },
  { key: 'security-level', label: 'Security Level set to Medium' }
] as const

export type CloudflareSecurityControlKey = typeof cloudflareSecurityControlDefinitions[number]['key']
export type CloudflareSecurityStatus = 'active' | 'inactive' | 'pending' | 'review' | 'unavailable'

export interface CloudflareSecurityEvidence {
  id: string
  siteId: string
  syncId: string | null
  controlKey: CloudflareSecurityControlKey
  status: CloudflareSecurityStatus
  source: 'cloudflare-api' | 'technician' | 'informational'
  summary: string
  notes: string | null
  evidence: Record<string, unknown>
  observedAt: string
  actorIdentifier: string | null
  supersededAt: string | null
  createdAt: string
}

export interface CloudflareSecurityControl extends CloudflareSecurityEvidence {
  label: string
  apiEvidence: CloudflareSecurityEvidence | null
  technicianOverride: CloudflareSecurityEvidence | null
}

export interface CloudflareSiteDetail {
  connection: CloudflareSiteConnection | null
  monitor: UptimeMonitorState | null
  incidents: UptimeIncident[]
  maintenanceWindows: UptimeMaintenanceWindow[]
  security: {
    checkedAt: string | null
    controls: CloudflareSecurityControl[]
  }
}
