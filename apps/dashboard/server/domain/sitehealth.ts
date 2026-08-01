export const siteHealthAreas = [
  'performance',
  'content',
  'media',
  'users',
  'plugins-themes',
  'environment',
  'database',
  'backups',
  'updates'
] as const

export type SiteHealthArea = typeof siteHealthAreas[number]
export type SiteHealthCheckupTrigger = 'manual' | 'annual'
export type SiteHealthCheckupStatus = 'queued' | 'running' | 'draft-ready' | 'failed' | 'cancelled'
export type SiteHealthEvidenceAvailability = 'available' | 'unavailable' | 'error'
export type SiteHealthFindingSeverity = 'info' | 'low' | 'medium' | 'high'
export type SiteHealthReviewStatus = 'draft' | 'published' | 'sent' | 'superseded'
export type SiteHealthApprovalStatus = 'approved-all' | 'declined' | 'partial'
export type SiteHealthCleanupStatus = 'proposed' | 'approved' | 'initiated' | 'completed' | 'cancelled'

export const cleanupActionTypes = [
  'remove-unused-plugin',
  'remove-unused-theme',
  'remove-unused-user',
  'optimize-database',
  'clear-revisions',
  'clear-expired-transients',
  'compress-images',
  'review-orphaned-media',
  'verify-backups',
  'verify-updates',
  'manual-maintenance'
] as const

export type SiteHealthCleanupActionType = typeof cleanupActionTypes[number]

export interface SiteHealthCheckup {
  id: string
  siteId: string
  triggerType: SiteHealthCheckupTrigger
  annualCycleDate: string | null
  status: SiteHealthCheckupStatus
  includeBrokenLinks: boolean
  requestedByType: string
  requestedBy: string
  automationJobId: string | null
  evidenceCheckInId: string | null
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteHealthAnnualPolicy {
  siteId: string
  enabled: boolean
  eligibleAt: string | null
  nextDueAt: string | null
  lastCompletedAt: string | null
  lastCheckupId: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteHealthEvidence {
  id: string
  checkupId: string
  siteId: string
  area: SiteHealthArea
  metricKey: string
  source: string
  availability: SiteHealthEvidenceAvailability
  summary: string
  value: Record<string, unknown>
  observedAt: string | null
  createdAt: string
}

export interface SiteHealthFinding {
  id: string
  checkupId: string
  siteId: string
  evidenceId: string | null
  area: SiteHealthArea
  title: string
  description: string
  severity: SiteHealthFindingSeverity
  origin: 'automated' | 'technician'
  status: 'active' | 'dismissed'
  technicianNotes: string | null
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SiteHealthRecommendation {
  id: string
  checkupId: string
  siteId: string
  area: SiteHealthArea
  actionType: SiteHealthCleanupActionType
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: 'proposed' | 'dismissed'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SiteHealthReviewContent {
  generatedAt: string
  site: { id: string, name: string, url: string }
  evidence: SiteHealthEvidence[]
  findings: SiteHealthFinding[]
  recommendations: SiteHealthRecommendation[]
  approvalInstructions: string
}

export interface SiteHealthReview {
  id: string
  checkupId: string
  siteId: string
  version: number
  status: SiteHealthReviewStatus
  title: string
  executiveSummary: string
  content: SiteHealthReviewContent
  createdBy: string
  publishedBy: string | null
  publishedAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteHealthApproval {
  id: string
  reviewId: string
  siteId: string
  status: SiteHealthApprovalStatus
  source: 'external-email' | 'phone' | 'other'
  notes: string
  recordedBy: string
  recordedAt: string
}

export interface SiteHealthCleanupProposal {
  id: string
  reviewId: string
  recommendationId: string
  siteId: string
  actionType: SiteHealthCleanupActionType
  status: SiteHealthCleanupStatus
  approvalId: string | null
  technicianNotes: string | null
  initiatedBy: string | null
  initiatedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteHealthCheckupDetail {
  checkup: SiteHealthCheckup
  evidence: SiteHealthEvidence[]
  findings: SiteHealthFinding[]
  recommendations: SiteHealthRecommendation[]
  reviews: SiteHealthReview[]
  approvals: SiteHealthApproval[]
  cleanupProposals: SiteHealthCleanupProposal[]
}
