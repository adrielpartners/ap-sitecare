export type SiteStatus = 'active' | 'disabled'
export type HealthStatus = 'healthy' | 'attention' | 'critical' | 'unknown'

export interface Site {
  id: string
  name: string
  url: string
  status: SiteStatus
  createdAt: string
  updatedAt: string
  disabledAt: string | null
}

export interface SiteCredential {
  id: string
  siteId: string
  secretCiphertext: string
  secretHint: string
  createdAt: string
  revokedAt: string | null
}

export interface SiteCheckIn {
  id: string
  siteId: string
  receivedAt: string
  source: string
  requestTimestamp: string | null
  payload: Record<string, unknown>
}

export interface SiteHealthSnapshot {
  id: string
  siteId: string
  checkInId: string
  status: HealthStatus
  wordpressVersion: string | null
  phpVersion: string | null
  pluginUpdateCount: number
  themeUpdateCount: number
  lastCronRunAt: string | null
  createdAt: string
}

export interface AuditEvent {
  id: string
  siteId: string | null
  actorType: string
  actorIdentifier: string | null
  eventType: string
  metadata: Record<string, unknown>
  createdAt: string
}
