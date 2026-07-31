import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import type {
  AutomationJob,
  AutomationJobHandler,
  AutomationSchedule,
  ClaimedAutomationJob,
  EnqueueAutomationJobInput,
  SaveAutomationScheduleInput
} from '../domain/automation'
import {
  AutomationCancellationError,
  AutomationNeedsAttentionError,
  AutomationPermanentError,
  automationJobStatuses
} from '../domain/automation'
import { AuditRepository } from '../repositories/audit-repository'
import { AutomationRepository } from '../repositories/automation-repository'
import { ServicePlanRepository } from '../repositories/service-plan-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EntitlementService } from './entitlement-service'
import { CredentialService } from './credential-service'
import { HostingerClient } from '../integrations/hostinger-client'
import { HostingerPortfolioService } from './hostinger-portfolio-service'
import { WordPressConnectorService } from './wordpress-connector-service'
import { CloudflareClient } from '../integrations/cloudflare-client'
import { CloudflareService } from './cloudflare-service'
import { BackupService } from './backup-service'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { SiteService } from './site-service'

const sensitiveKey = /(password|secret|token|credential|authorization|api[-_]?key)/i

export class AutomationService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async enqueue(input: EnqueueAutomationJobInput): Promise<{ job: AutomationJob, created: boolean }> {
    const jobType = requiredIdentifier(input.jobType, 'Job type')
    const operationKey = requiredIdentifier(input.operationKey, 'Operation key')
    const idempotencyKey = requiredText(input.idempotencyKey, 'Idempotency key', 300)
    const requestedBy = requiredText(input.requestedBy, 'Requesting actor', 300)
    const requestedByType = requiredIdentifier(input.requestedByType, 'Requesting actor type')
    const maxAttempts = boundedInteger(input.maxAttempts ?? 3, 1, 20, 'Maximum attempts')
    const payload = safeRecord(input.payload ?? {}, 'Automation job payload')
    const now = new Date().toISOString()
    const availableAt = validDate(input.availableAt ?? now, 'Available time')

    return this.withTransaction(async executor => {
      const result = await new AutomationRepository(executor).enqueue({
        id: randomUUID(),
        siteId: input.siteId ?? null,
        scheduleId: input.scheduleId ?? null,
        parentJobId: input.parentJobId ?? null,
        jobType,
        operationKey,
        status: 'queued',
        payload,
        result: {},
        idempotencyKey,
        requestedByType,
        requestedBy,
        maxAttempts,
        attemptCount: 0,
        availableAt,
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        cancellationRequestedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        updatedAt: now
      })
      if (result.created) {
        await new AuditService(new AuditRepository(executor)).record({
          siteId: result.job.siteId,
          actorType: requestedByType,
          actorIdentifier: requestedBy,
          eventType: 'automation.job.queued',
          metadata: {
            jobId: result.job.id,
            jobType,
            operationKey,
            scheduleId: result.job.scheduleId,
            availableAt
          }
        })
      }
      return result
    })
  }

  async get(jobId: string): Promise<{ job: AutomationJob, attempts: Awaited<ReturnType<AutomationRepository['listAttempts']>> }> {
    const repository = new AutomationRepository(this.database)
    const job = await repository.findById(jobId)
    if (!job) throw new Error('Automation job not found.')
    return { job, attempts: await repository.listAttempts(jobId) }
  }

  async list(options: { siteId?: string | null, status?: string, limit?: number } = {}): Promise<AutomationJob[]> {
    if (options.status && !automationJobStatuses.includes(options.status as AutomationJob['status'])) {
      throw new Error('Unsupported automation job status.')
    }
    return new AutomationRepository(this.database).list({
      siteId: options.siteId,
      status: options.status as AutomationJob['status'] | undefined,
      limit: options.limit
    })
  }

  async cancel(jobId: string, actorIdentifier: string): Promise<AutomationJob> {
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const job = await new AutomationRepository(executor).requestCancellation(jobId, now)
      await new AuditService(new AuditRepository(executor)).record({
        siteId: job.siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: job.status === 'cancelled'
          ? 'automation.job.cancelled'
          : 'automation.job.cancellation-requested',
        metadata: { jobId: job.id, jobType: job.jobType }
      })
      return job
    })
  }

  async retry(jobId: string, actorIdentifier: string, additionalAttempts = 3): Promise<AutomationJob> {
    boundedInteger(additionalAttempts, 1, 10, 'Additional attempts')
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const job = await new AutomationRepository(executor).retry(jobId, additionalAttempts, now)
      await new AuditService(new AuditRepository(executor)).record({
        siteId: job.siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'automation.job.manual-retry-queued',
        metadata: { jobId: job.id, jobType: job.jobType, additionalAttempts }
      })
      return job
    })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

export class SchedulerService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async save(input: SaveAutomationScheduleInput): Promise<AutomationSchedule> {
    const existing = input.id ? await new AutomationRepository(this.database).findSchedule(input.id) : null
    const now = new Date().toISOString()
    const schedule: AutomationSchedule = {
      id: input.id ?? randomUUID(),
      siteId: input.siteId ?? null,
      name: requiredText(input.name, 'Schedule name', 160),
      jobType: requiredIdentifier(input.jobType, 'Job type'),
      operationKey: requiredIdentifier(input.operationKey, 'Operation key'),
      payload: safeRecord(input.payload ?? {}, 'Schedule payload'),
      intervalSeconds: boundedInteger(input.intervalSeconds, 60, 31_536_000, 'Schedule interval'),
      maxAttempts: boundedInteger(input.maxAttempts ?? 3, 1, 20, 'Maximum attempts'),
      enabled: input.enabled,
      nextRunAt: validDate(input.nextRunAt, 'Next run time'),
      lastEnqueuedAt: existing?.lastEnqueuedAt ?? null,
      createdBy: existing?.createdBy ?? input.actorIdentifier,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    return new AutomationRepository(this.database).saveSchedule(schedule)
  }

  async list(): Promise<AutomationSchedule[]> {
    return new AutomationRepository(this.database).listSchedules()
  }

  async ensureEntitlementSchedules(at = new Date()): Promise<number> {
    const subscriptions = await new ServicePlanRepository(this.database).listSubscriptions()
    let created = 0
    for (const subscription of subscriptions) {
      const id = `system:entitlements:${subscription.siteId}`
      if (await new AutomationRepository(this.database).findSchedule(id)) continue
      await this.save({
        id,
        siteId: subscription.siteId,
        name: 'Synchronize plan lifecycle and overrides',
        jobType: 'entitlements.synchronize',
        operationKey: 'entitlements',
        intervalSeconds: 300,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    return created
  }

  async ensurePhaseFiveSchedules(at = new Date()): Promise<number> {
    const repository = new AutomationRepository(this.database)
    const subscriptions = await new ServicePlanRepository(this.database).listSubscriptions()
    let created = 0
    for (const subscription of subscriptions) {
      const id = `system:wordpress-refresh:${subscription.siteId}`
      if (await repository.findSchedule(id)) continue
      await this.save({
        id,
        siteId: subscription.siteId,
        name: 'Refresh WordPress update inventory',
        jobType: 'wordpress.refresh',
        operationKey: 'wordpress-update-refresh',
        intervalSeconds: 21_600,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    const hostingerId = 'system:hostinger-portfolio'
    if (!await repository.findSchedule(hostingerId)) {
      await this.save({
        id: hostingerId,
        siteId: null,
        name: 'Synchronize Hostinger portfolio visibility',
        jobType: 'hostinger.portfolio.synchronize',
        operationKey: 'hostinger-portfolio',
        intervalSeconds: 21_600,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    return created
  }

  async ensurePhaseSixSchedules(at = new Date()): Promise<number> {
    const repository = new AutomationRepository(this.database)
    const subscriptions = await new ServicePlanRepository(this.database).listSubscriptions()
    let created = 0
    for (const subscription of subscriptions) {
      const uptimeId = `system:cloudflare-uptime:${subscription.siteId}`
      if (!await repository.findSchedule(uptimeId)) {
        await this.save({
          id: uptimeId,
          siteId: subscription.siteId,
          name: 'Reconcile Cloudflare uptime state',
          jobType: 'cloudflare.uptime.reconcile',
          operationKey: 'cloudflare-uptime',
          intervalSeconds: 60,
          maxAttempts: 3,
          enabled: true,
          nextRunAt: at.toISOString(),
          actorIdentifier: 'system:scheduler'
        })
        created += 1
      }
      const securityId = `system:cloudflare-security:${subscription.siteId}`
      if (!await repository.findSchedule(securityId)) {
        await this.save({
          id: securityId,
          siteId: subscription.siteId,
          name: 'Synchronize Cloudflare Security Status',
          jobType: 'cloudflare.security.synchronize',
          operationKey: 'cloudflare-security',
          intervalSeconds: 21_600,
          maxAttempts: 3,
          enabled: true,
          nextRunAt: at.toISOString(),
          actorIdentifier: 'system:scheduler'
        })
        created += 1
      }
    }
    const retentionId = 'system:cloudflare-uptime-retention'
    if (!await repository.findSchedule(retentionId)) {
      await this.save({
        id: retentionId,
        siteId: null,
        name: 'Roll off Cloudflare raw uptime history',
        jobType: 'cloudflare.uptime.retention',
        operationKey: 'cloudflare-uptime-retention',
        intervalSeconds: 86_400,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    return created
  }

  async ensurePhaseSevenSchedules(at = new Date()): Promise<number> {
    const repository = new AutomationRepository(this.database)
    const subscriptions = await new ServicePlanRepository(this.database).listSubscriptions()
    let created = 0
    for (const subscription of subscriptions) {
      const id = `system:sitecare-pro-backup:${subscription.siteId}`
      if (await repository.findSchedule(id)) continue
      await this.save({
        id,
        siteId: subscription.siteId,
        name: 'Evaluate SiteCare Pro monthly backup schedule',
        jobType: 'sitecare.backup.schedule',
        operationKey: 'sitecare-pro-backup',
        intervalSeconds: 86_400,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    const retentionId = 'system:sitecare-backup-retention'
    if (!await repository.findSchedule(retentionId)) {
      await this.save({
        id: retentionId,
        siteId: null,
        name: 'Evaluate SiteCare long-term backup retention',
        jobType: 'sitecare.backup.retention-dry-run',
        operationKey: 'sitecare-backup-retention',
        intervalSeconds: 86_400,
        maxAttempts: 3,
        enabled: true,
        nextRunAt: at.toISOString(),
        actorIdentifier: 'system:scheduler'
      })
      created += 1
    }
    return created
  }

  async tick(at = new Date(), limit = 100): Promise<number> {
    const now = at.toISOString()
    return this.withTransaction(async executor => {
      const repository = new AutomationRepository(executor)
      const due = await repository.listDueSchedulesForUpdate(now, Math.min(500, Math.max(1, limit)))
      let enqueued = 0
      for (const schedule of due) {
        const result = await new AutomationService(executor).enqueue({
          siteId: schedule.siteId,
          scheduleId: schedule.id,
          jobType: schedule.jobType,
          operationKey: schedule.operationKey,
          payload: schedule.payload,
          idempotencyKey: `schedule:${schedule.id}:${schedule.nextRunAt}`,
          requestedByType: 'scheduler',
          requestedBy: 'system:scheduler',
          maxAttempts: schedule.maxAttempts,
          availableAt: now
        })
        const nextRunAt = new Date(at.getTime() + schedule.intervalSeconds * 1000).toISOString()
        await repository.markScheduleEnqueued(schedule.id, schedule.nextRunAt, nextRunAt, now)
        if (result.created) enqueued += 1
      }
      return enqueued
    })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

export interface AutomationWorkerSettings {
  leaseSeconds: number
  heartbeatSeconds: number
  retryBaseSeconds: number
}

export class AutomationWorkerService {
  private readonly workerId: string

  constructor(
    private readonly repository = new AutomationRepository(),
    private readonly handlers: ReadonlyMap<string, AutomationJobHandler> = new Map(),
    private readonly audit = new AuditService(),
    private readonly settings: AutomationWorkerSettings = {
      leaseSeconds: 120,
      heartbeatSeconds: 30,
      retryBaseSeconds: 30
    },
    workerId = `${hostname()}:${process.pid}:automation`
  ) {
    this.workerId = workerId
  }

  async runNext(): Promise<AutomationJob | null> {
    const now = new Date()
    for (const stale of await this.repository.recoverStale(now.toISOString())) {
      await this.record(stale, stale.status === 'queued'
        ? 'automation.job.interrupted-retry-queued'
        : 'automation.job.needs-attention', {
        errorCode: stale.errorCode,
        errorMessage: stale.errorMessage
      })
    }

    const job = await this.repository.claimNext(
      now.toISOString(),
      this.workerId,
      this.leaseExpiry(now).toISOString()
    )
    if (!job) return null
    await this.record(job, 'automation.job.preflight', { attempt: job.attemptCount })

    const heartbeat = setInterval(() => {
      void this.heartbeat(job).catch(() => {
        // The foreground path will surface an invalid or expired lease.
      })
    }, this.settings.heartbeatSeconds * 1000)
    heartbeat.unref()

    const context = {
      heartbeat: () => this.heartbeat(job),
      throwIfCancellationRequested: () => this.throwIfCancellationRequested(job)
    }
    let output: Record<string, unknown> = {}
    try {
      const handler = this.handlers.get(job.jobType)
      if (!handler) throw new AutomationNeedsAttentionError(`No handler is registered for ${job.jobType}.`, 'handler-missing')
      await context.throwIfCancellationRequested()
      await handler.preflight?.(job, context)
      await context.throwIfCancellationRequested()
      await this.repository.transitionActive(job.id, job.leaseToken, 'preflight', 'running', new Date().toISOString())
      await this.record(job, 'automation.job.running', { attempt: job.attemptCount })
      output = safeRecord(await handler.execute(job, context) ?? {}, 'Automation job output')
      await context.throwIfCancellationRequested()
      await this.repository.transitionActive(job.id, job.leaseToken, 'running', 'verifying', new Date().toISOString())
      await this.record(job, 'automation.job.verifying', { attempt: job.attemptCount })
      output = safeRecord(await handler.verify?.(job, output, context) ?? output, 'Automation verification output')
      await context.throwIfCancellationRequested()
      await this.repository.finishSucceeded(job.id, job.leaseToken, output, new Date().toISOString())
      const completed = await this.requiredJob(job.id)
      await this.record(completed, 'automation.job.succeeded', { attempt: job.attemptCount, result: output })
      return completed
    } catch (error) {
      const failure = normalizeFailure(error)
      const status = error instanceof AutomationCancellationError
        ? 'cancelled'
        : error instanceof AutomationPermanentError
          ? 'failed'
          : error instanceof AutomationNeedsAttentionError
            ? 'needs-attention'
            : job.attemptCount < job.maxAttempts ? 'queued' : 'needs-attention'
      const availableAt = status === 'queued'
        ? new Date(Date.now() + this.retryDelayMilliseconds(job.attemptCount)).toISOString()
        : null
      try {
        await this.repository.finishClaim(
          job.id,
          job.leaseToken,
          status,
          status === 'cancelled' ? 'cancelled' : 'failed',
          output,
          failure.code,
          failure.message,
          availableAt,
          new Date().toISOString()
        )
      } catch {
        // Stale recovery may have invalidated this worker's lease.
      }
      const failed = await this.requiredJob(job.id)
      await this.record(failed, status === 'queued'
        ? 'automation.job.retry-scheduled'
        : status === 'cancelled'
          ? 'automation.job.cancelled'
          : status === 'failed'
            ? 'automation.job.failed'
            : 'automation.job.needs-attention', {
        attempt: job.attemptCount,
        errorCode: failure.code,
        errorMessage: failure.message,
        availableAt
      })
      return failed
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async heartbeat(job: ClaimedAutomationJob): Promise<void> {
    const now = new Date()
    const valid = await this.repository.heartbeat(
      job.id,
      job.leaseToken,
      now.toISOString(),
      this.leaseExpiry(now).toISOString()
    )
    if (!valid) throw new Error('The automation job lease is no longer valid.')
  }

  private async throwIfCancellationRequested(job: ClaimedAutomationJob): Promise<void> {
    if (await this.repository.isCancellationRequested(job.id, job.leaseToken)) {
      throw new AutomationCancellationError()
    }
  }

  private leaseExpiry(now: Date): Date {
    return new Date(now.getTime() + this.settings.leaseSeconds * 1000)
  }

  private retryDelayMilliseconds(attempt: number): number {
    return Math.min(3_600_000, this.settings.retryBaseSeconds * 1000 * 2 ** Math.max(0, attempt - 1))
  }

  private async requiredJob(jobId: string): Promise<AutomationJob> {
    const job = await this.repository.findById(jobId)
    if (!job) throw new Error('Automation job not found.')
    return job
  }

  private async record(job: AutomationJob, eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.audit.record({
      siteId: job.siteId,
      actorType: 'automation-worker',
      actorIdentifier: this.workerId,
      eventType,
      metadata: { jobId: job.id, jobType: job.jobType, operationKey: job.operationKey, ...metadata }
    })
  }
}

export interface CoreAutomationHandlerSettings {
  credentialEncryptionKey: string
  hostingerApiBaseUrl: string
  hostingerApiToken: string
  cloudflareApiBaseUrl: string
  cloudflareApiToken: string
  cloudflareAccountId: string
  cloudflareWebhookDestinationId: string
  cloudflareNotificationPolicyId: string
  cloudflareWebhookSecretConfigured: boolean
  dropboxAccessToken: string
  dropboxRefreshToken: string
  dropboxAppKey: string
  dropboxAppSecret: string
  dropboxRedirectUri: string
  dropboxBackupRoot: string
  dropboxAccountLabel: string
  dropboxEnabled: boolean
  dropboxTokenStrategy: 'runtime-access-token' | 'oauth'
  allowedLocalBaseDirectories: string[]
  backupTempRoot: string
}

export function createCoreAutomationHandlers(
  database: QueryExecutor | TransactionalQueryExecutor = useDatabase(),
  settings: CoreAutomationHandlerSettings = {
    credentialEncryptionKey: process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY ?? '',
    hostingerApiBaseUrl: process.env.NUXT_INTEGRATIONS_HOSTINGER_API_BASE_URL ?? 'https://developers.hostinger.com',
    hostingerApiToken: process.env.NUXT_INTEGRATIONS_HOSTINGER_API_TOKEN ?? '',
    cloudflareApiBaseUrl: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_API_BASE_URL ?? 'https://api.cloudflare.com/client/v4',
    cloudflareApiToken: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_API_TOKEN ?? '',
    cloudflareAccountId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_ACCOUNT_ID ?? '',
    cloudflareWebhookDestinationId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_DESTINATION_ID ?? '',
    cloudflareNotificationPolicyId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_NOTIFICATION_POLICY_ID ?? '',
    cloudflareWebhookSecretConfigured: Boolean(process.env.NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_SECRET),
    dropboxAccessToken: process.env.NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN ?? '',
    dropboxRefreshToken: process.env.NUXT_INTEGRATIONS_DROPBOX_REFRESH_TOKEN ?? '',
    dropboxAppKey: process.env.NUXT_INTEGRATIONS_DROPBOX_APP_KEY ?? '',
    dropboxAppSecret: process.env.NUXT_INTEGRATIONS_DROPBOX_APP_SECRET ?? '',
    dropboxRedirectUri: process.env.NUXT_INTEGRATIONS_DROPBOX_REDIRECT_URI ?? '',
    dropboxBackupRoot: process.env.NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT ?? '/SiteCare Backups',
    dropboxAccountLabel: process.env.NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL ?? 'SiteCare Dropbox',
    dropboxEnabled: process.env.NUXT_BACKUPS_DROPBOX_ENABLED !== 'false',
    dropboxTokenStrategy: process.env.NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY === 'oauth' ? 'oauth' : 'runtime-access-token',
    allowedLocalBaseDirectories: (process.env.NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES ?? '').split(',').map(value => value.trim()).filter(Boolean),
    backupTempRoot: process.env.NUXT_BACKUPS_TEMP_ROOT ?? '/tmp/ap-sitecare-backups'
  }
): Map<string, AutomationJobHandler> {
  const credentials = new CredentialService(settings.credentialEncryptionKey, undefined, undefined)
  const wordpress = new WordPressConnectorService(
    credentials,
    undefined,
    undefined
  )
  const hostinger = new HostingerPortfolioService(
    new HostingerClient(settings.hostingerApiToken, settings.hostingerApiBaseUrl),
    undefined,
    undefined,
    undefined
  )
  const cloudflare = new CloudflareService(
    new CloudflareClient(settings.cloudflareApiToken, fetch, settings.cloudflareApiBaseUrl),
    database,
    undefined,
    {
      accountId: settings.cloudflareAccountId,
      webhookDestinationId: settings.cloudflareWebhookDestinationId,
      notificationPolicyId: settings.cloudflareNotificationPolicyId,
      webhookSecretConfigured: settings.cloudflareWebhookSecretConfigured
    }
  )
  const audit = new AuditService(new AuditRepository(database))
  const backups = new BackupService({
    credentialEncryptionKey: settings.credentialEncryptionKey,
    dropboxAccessToken: settings.dropboxAccessToken,
    dropboxRefreshToken: settings.dropboxRefreshToken,
    dropboxAppKey: settings.dropboxAppKey,
    dropboxAppSecret: settings.dropboxAppSecret,
    dropboxRedirectUri: settings.dropboxRedirectUri,
    dropboxBackupRoot: settings.dropboxBackupRoot,
    dropboxAccountLabel: settings.dropboxAccountLabel,
    dropboxEnabled: settings.dropboxEnabled,
    dropboxTokenStrategy: settings.dropboxTokenStrategy,
    allowedLocalBaseDirectories: settings.allowedLocalBaseDirectories,
    tempRoot: settings.backupTempRoot
  }, new BackupRepository(database), new SiteService(new SiteRepository(database), audit), audit)
  return new Map([
    ['entitlements.synchronize', {
      async execute(job) {
        if (!job.siteId) throw new AutomationPermanentError('Entitlement synchronization requires a site.', 'site-required')
        const effective = await new EntitlementService(database).get(job.siteId)
        return {
          evaluatedAt: effective.evaluatedAt,
          planId: effective.underlyingPlan.id,
          operationalStatus: effective.operationalStatus,
          pendingTransitionId: effective.pendingTransition?.id ?? null,
          activeOverrideCount: effective.activeOverrides.length
        }
      }
    }],
    ['wordpress.refresh', {
      async execute(job) {
        if (!job.siteId) throw new AutomationPermanentError('WordPress refresh requires a site.', 'site-required')
        const entitlement = await new EntitlementService(database).get(job.siteId)
        if (!entitlement.capabilities['wordpress-update-monitoring']) {
          return { skipped: true, reason: 'wordpress-update-monitoring-not-entitled' }
        }
        const connection = await credentials.getConnectionSummary(job.siteId)
        if (!connection.activeCredential || !connection.connection || connection.connection.contractVersion < 2) {
          return { skipped: true, reason: 'wordpress-connector-upgrade-required' }
        }
        return wordpress.requestRefresh(job.siteId)
      },
      async verify(job, output) {
        if (output.skipped === true) return output
        if (!job.siteId || typeof output.requestedAt !== 'string') {
          throw new AutomationPermanentError('WordPress refresh verification evidence is incomplete.', 'verification-evidence-missing')
        }
        return { ...output, ...await wordpress.verifyRefresh(job.siteId, output.requestedAt) }
      }
    }],
    ['hostinger.portfolio.synchronize', {
      async execute(job) {
        return hostinger.synchronize(job.requestedBy)
      }
    }],
    ['cloudflare.uptime.reconcile', {
      async execute(job) {
        if (!job.siteId) throw new AutomationPermanentError('Cloudflare uptime reconciliation requires a site.', 'site-required')
        if (!settings.cloudflareApiToken) return { skipped: true, reason: 'cloudflare-api-not-configured' }
        return cloudflare.reconcileUptime(job.siteId)
      }
    }],
    ['cloudflare.security.synchronize', {
      async execute(job) {
        if (!job.siteId) throw new AutomationPermanentError('Cloudflare security synchronization requires a site.', 'site-required')
        if (!settings.cloudflareApiToken) return { skipped: true, reason: 'cloudflare-api-not-configured' }
        const controls = await cloudflare.synchronizeSecurity(job.siteId)
        return {
          controlCount: controls.length,
          activeCount: controls.filter(control => control.status === 'active').length,
          reviewCount: controls.filter(control => control.status !== 'active').length
        }
      }
    }],
    ['cloudflare.uptime.retention', {
      async execute() {
        return { deletedObservationCount: await cloudflare.purgeRawHistory() }
      }
    }],
    ['sitecare.backup.schedule', {
      async execute(job) {
        if (!job.siteId) throw new AutomationPermanentError('SiteCare backup scheduling requires a site.', 'site-required')
        const entitlement = await new EntitlementService(database).get(job.siteId)
        if (!entitlement.capabilities['long-term-backups']) {
          return { skipped: true, reason: 'long-term-backups-not-entitled' }
        }
        const result = await backups.planScheduledBackup(job.siteId, job.requestedBy)
        if (!('skipped' in result)) {
          await new ServicePlanRepository(database).acknowledgePendingActivationIntents(
            job.siteId,
            ['long-term-backups'],
            new Date().toISOString()
          )
        }
        return result
      }
    }],
    ['sitecare.backup.retention-dry-run', {
      async execute(job) {
        return backups.runRetentionDryRun(job.requestedBy)
      }
    }]
  ])
}

function normalizeFailure(error: unknown): { code: string, message: string } {
  const code = error instanceof AutomationPermanentError || error instanceof AutomationNeedsAttentionError
    ? error.code
    : error instanceof AutomationCancellationError ? 'cancelled' : 'execution-failed'
  const message = error instanceof Error ? error.message : 'Automation execution failed.'
  return {
    code,
    message: message
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
      .slice(0, 1000)
  }
}

function safeRecord(value: Record<string, unknown>, label: string): Record<string, unknown> {
  const visit = (item: unknown, path: string): unknown => {
    if (Array.isArray(item)) return item.map((entry, index) => visit(entry, `${path}[${index}]`))
    if (!item || typeof item !== 'object') return item
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      if (sensitiveKey.test(key)) throw new Error(`${label} cannot contain sensitive field ${path}${key}.`)
      output[key] = visit(entry, `${path}${key}.`)
    }
    return output
  }
  const result = visit(value, '') as Record<string, unknown>
  if (JSON.stringify(result).length > 65_536) throw new Error(`${label} must not exceed 64 KiB.`)
  return result
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = requiredText(value, label, 160)
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(normalized)) throw new Error(`${label} contains unsupported characters.`)
  return normalized
}

function requiredText(value: string, label: string, max: number): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > max) throw new Error(`${label} must not exceed ${max} characters.`)
  return normalized
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`)
  }
  return value
}

function validDate(value: string, label: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date and time.`)
  return date.toISOString()
}
