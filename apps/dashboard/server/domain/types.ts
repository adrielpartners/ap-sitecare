export type SiteStatus = 'active' | 'disabled'
export type HealthStatus = 'healthy' | 'attention' | 'critical' | 'unknown'
export type RiskLevel = 'low' | 'standard' | 'high'
export type ActionRequestStatus = 'pending' | 'approved' | 'rejected'

export interface Site {
  id: string
  name: string
  url: string
  status: SiteStatus
  hostingProvider: string | null
  backupStrategy: string | null
  riskLevel: RiskLevel
  notes: string | null
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

export interface ActionRequest {
  id: string
  siteId: string
  actionType: string
  rationale: string
  status: ActionRequestStatus
  requestedBy: string
  reviewedBy: string | null
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}
