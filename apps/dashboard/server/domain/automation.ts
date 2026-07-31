export const automationJobStatuses = [
  'queued',
  'preflight',
  'running',
  'verifying',
  'succeeded',
  'failed',
  'needs-attention',
  'cancelled'
] as const

export type AutomationJobStatus = typeof automationJobStatuses[number]
export type AutomationActiveStatus = Extract<AutomationJobStatus, 'preflight' | 'running' | 'verifying'>
export type AutomationAttemptStatus = AutomationActiveStatus | 'succeeded' | 'failed' | 'interrupted' | 'cancelled'

export interface AutomationJob {
  id: string
  siteId: string | null
  scheduleId: string | null
  parentJobId: string | null
  jobType: string
  operationKey: string
  status: AutomationJobStatus
  payload: Record<string, unknown>
  result: Record<string, unknown>
  idempotencyKey: string
  requestedByType: string
  requestedBy: string
  maxAttempts: number
  attemptCount: number
  availableAt: string
  leaseToken: string | null
  leaseOwner: string | null
  leaseExpiresAt: string | null
  heartbeatAt: string | null
  cancellationRequestedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface ClaimedAutomationJob extends AutomationJob {
  leaseToken: string
  leaseOwner: string
  leaseExpiresAt: string
}

export interface AutomationJobAttempt {
  id: string
  jobId: string
  attemptNumber: number
  workerId: string
  status: AutomationAttemptStatus
  startedAt: string
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  output: Record<string, unknown>
}

export interface AutomationSchedule {
  id: string
  siteId: string | null
  name: string
  jobType: string
  operationKey: string
  payload: Record<string, unknown>
  intervalSeconds: number
  maxAttempts: number
  enabled: boolean
  nextRunAt: string
  lastEnqueuedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface EnqueueAutomationJobInput {
  siteId?: string | null
  scheduleId?: string | null
  parentJobId?: string | null
  jobType: string
  operationKey: string
  payload?: Record<string, unknown>
  idempotencyKey: string
  requestedByType: string
  requestedBy: string
  maxAttempts?: number
  availableAt?: string
}

export interface SaveAutomationScheduleInput {
  id?: string
  siteId?: string | null
  name: string
  jobType: string
  operationKey: string
  payload?: Record<string, unknown>
  intervalSeconds: number
  maxAttempts?: number
  enabled: boolean
  nextRunAt: string
  actorIdentifier: string
}

export interface AutomationHandlerContext {
  heartbeat(): Promise<void>
  throwIfCancellationRequested(): Promise<void>
}

export interface AutomationJobHandler {
  preflight?(job: ClaimedAutomationJob, context: AutomationHandlerContext): Promise<void>
  execute(job: ClaimedAutomationJob, context: AutomationHandlerContext): Promise<Record<string, unknown> | void>
  verify?(
    job: ClaimedAutomationJob,
    result: Record<string, unknown>,
    context: AutomationHandlerContext
  ): Promise<Record<string, unknown> | void>
}

export class AutomationPermanentError extends Error {
  constructor(message: string, readonly code = 'permanent-failure') {
    super(message)
    this.name = 'AutomationPermanentError'
  }
}

export class AutomationNeedsAttentionError extends Error {
  constructor(message: string, readonly code = 'needs-attention') {
    super(message)
    this.name = 'AutomationNeedsAttentionError'
  }
}

export class AutomationCancellationError extends Error {
  constructor(message = 'Cancellation was requested.') {
    super(message)
    this.name = 'AutomationCancellationError'
  }
}
