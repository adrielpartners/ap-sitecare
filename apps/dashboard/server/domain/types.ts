export type SiteStatus = 'active' | 'disabled'
export type HealthStatus = 'healthy' | 'attention' | 'critical' | 'unknown'
export type RiskLevel = 'low' | 'standard' | 'high'
export type ActionRequestStatus = 'pending' | 'approved' | 'rejected'
export type OperationalSignalStatus = 'healthy' | 'attention' | 'critical' | 'unknown'
export type ScheduledTaskType = 'daily-check-in' | 'weekly-security-scan' | 'monthly-report' | 'monthly-offsite-archive'
export type BackupFrequency = 'daily' | 'weekly' | 'monthly'
export type BackupRunType = 'scheduled' | 'manual' | 'pre-restore'
export type BackupStatus = 'planned' | 'queued' | 'running' | 'completed' | 'failed' | 'expired'
export type StorageProviderType = 'dropbox' | 's3-compatible' | 'google-drive' | 'local-filesystem' | 'backblaze-b2'
export type HostingConnectionType = 'local-vps' | 'ssh-sftp' | 'sftp-only' | 'database-credentials' | 'hosting-api' | 'manual-unsupported'
export type RestoreCapability = 'full' | 'partial' | 'backup-only' | 'unsupported'
export type RestorePlanStatus = 'draft' | 'preflight-passed' | 'preflight-failed' | 'cancelled'

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

export interface DashboardAggregates {
  totalManagedSites: number
  healthySites: number
  attentionSites: number
  criticalIssues: number
  unknownSites: number
  healthDistribution: Record<HealthStatus, number>
}

export interface ManagedSiteOverview {
  id: string
  name: string
  url: string
  status: HealthStatus
  statusReason: string
  uptimeStatus: OperationalSignalStatus
  updateStatus: OperationalSignalStatus
  pendingUpdateCount: number | null
  securityStatus: OperationalSignalStatus
  backupStatus: OperationalSignalStatus
  sslStatus: OperationalSignalStatus
  lastCheckInAt: string | null
}

export interface RecentActivity {
  id: string
  siteId: string | null
  siteName: string | null
  eventType: string
  label: string
  createdAt: string
}

export interface ScheduledTask {
  id: ScheduledTaskType
  label: string
  description: string
  scheduledFor: string
  status: 'scheduled'
}

export interface BackupRetention {
  keepDaily: number
  keepWeekly: number
  keepMonthly: number
  autoDeleteExpired: boolean
}

export interface BackupPolicy {
  siteId: string
  enabled: boolean
  frequency: BackupFrequency
  filesEnabled: boolean
  databaseEnabled: boolean
  storageProvider: StorageProviderType
  retention: BackupRetention
  restoreEnabled: boolean
  restoreRequiresConfirmation: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface HostingConnection {
  siteId: string
  connectionType: HostingConnectionType
  localPath: string | null
  databaseConfigured: boolean
  databaseHost: string | null
  databasePort: number | null
  databaseName: string | null
  databaseUsername: string | null
  providerLabel: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface StorageProviderConfiguration {
  provider: StorageProviderType
  accountLabel: string | null
  basePath: string
  enabled: boolean
  tokenStrategy: 'runtime-access-token' | 'oauth' | 'not-configured'
  configured: boolean
}

export interface BackupArtifact {
  id: string
  siteId: string
  backupType: BackupRunType
  frequency: BackupFrequency | 'manual'
  filesIncluded: boolean
  databaseIncluded: boolean
  storageProvider: StorageProviderType
  storagePath: string
  status: BackupStatus
  sizeBytes: number | null
  checksum: string | null
  startedAt: string
  completedAt: string | null
  expiresAt: string | null
  retentionCategory: BackupFrequency | 'manual'
  manifestPath: string | null
  manifest: BackupManifest | null
  checksumVerifiedAt: string | null
  uploadVerifiedAt: string | null
  errorMessage: string | null
}

export interface BackupJob {
  id: string
  siteId: string
  backupId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  runner: 'manual-placeholder' | 'background-worker'
  requestedBy: string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  attemptCount: number
  claimedAt: string | null
  heartbeatAt: string | null
  errorMessage: string | null
}

export interface BackupManifestArtifact {
  type: 'files' | 'database' | 'manifest' | 'checksums'
  archiveName: string
  sizeBytes: number
  checksumSha256: string
}

export interface BackupManifest {
  backupVersion: 1
  siteId: string
  siteDomain: string
  backupId: string
  backupTimestamp: string
  wordpressPath: string
  databaseName?: string
  includedArtifacts: BackupManifestArtifact[]
  includedPaths: string[]
  excludedPaths: string[]
  archiveNames: string[]
  storageProvider: 'dropbox'
  storagePath: string
}

export interface RestorePlan {
  id: string
  siteId: string
  backupId: string
  status: RestorePlanStatus
  restoreFiles: boolean
  restoreDatabase: boolean
  capability: RestoreCapability
  preflight: Record<string, unknown>
  warnings: string[]
  confirmationRequired: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}
