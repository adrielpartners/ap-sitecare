export type PluginPackageValidationStatus = 'validated' | 'rejected' | 'quarantined'
export type PluginPackageScanStatus = 'structural-passed' | 'external-passed' | 'external-unavailable' | 'failed'
export type PluginRolloutStatus = 'draft' | 'approved' | 'canary-running' | 'paused' | 'running' | 'completed' | 'failed' | 'cancelled'
export type PluginTargetCategory = 'eligible' | 'current' | 'not-installed' | 'disconnected' | 'suspended' | 'incompatible' | 'recovery-required'
export type PluginTargetStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'needs-attention'

export interface PluginUpdatePackage {
  id: string
  pluginSlug: string
  pluginName: string
  version: string
  originalFilename: string
  checksumSha256: string
  sizeBytes: number
  storagePath: string
  validationStatus: PluginPackageValidationStatus
  scanStatus: PluginPackageScanStatus
  provenance: Record<string, unknown>
  manifest: Record<string, unknown>
  uploadedBy: string
  createdAt: string
}

export interface SiteRecoveryEvidence {
  id: string
  siteId: string
  source: 'sitecare-backup' | 'hostinger-technician-confirmed'
  backupReference: string
  backupCompletedAt: string
  validUntil: string
  notes: string | null
  confirmedBy: string
  createdAt: string
}

export interface PluginUpdateRollout {
  id: string
  packageId: string
  actionRequestId: string | null
  status: PluginRolloutStatus
  canarySize: number
  failureThreshold: number
  concurrencyLimit: number
  haltReason: string | null
  createdBy: string
  confirmedBy: string | null
  confirmedAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PluginUpdateTarget {
  id: string
  rolloutId: string
  siteId: string
  pluginFile: string | null
  installedVersion: string | null
  targetVersion: string
  resultingVersion: string | null
  category: PluginTargetCategory
  selected: boolean
  recoveryReady: boolean
  recoveryEvidenceId: string | null
  preflightStatus: 'pending' | 'passed' | 'blocked'
  preflightMessage: string | null
  batchNumber: number | null
  status: PluginTargetStatus
  automationJobId: string | null
  attemptCount: number
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  response: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PluginRolloutDetail {
  rollout: PluginUpdateRollout
  package: Omit<PluginUpdatePackage, 'storagePath'>
  targets: Array<PluginUpdateTarget & { siteName: string, siteUrl: string }>
}
