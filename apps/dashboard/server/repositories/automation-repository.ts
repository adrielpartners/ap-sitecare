import { randomUUID } from 'node:crypto'
import type {
  AutomationActiveStatus,
  AutomationAttemptStatus,
  AutomationJob,
  AutomationJobAttempt,
  AutomationJobStatus,
  AutomationSchedule,
  ClaimedAutomationJob
} from '../domain/automation'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface JobRow {
  id: string
  site_id: string | null
  schedule_id: string | null
  parent_job_id: string | null
  job_type: string
  operation_key: string
  status: AutomationJobStatus
  payload_json: unknown
  result_json: unknown
  idempotency_key: string
  requested_by_type: string
  requested_by: string
  max_attempts: number
  attempt_count: number
  available_at: string
  lease_token: string | null
  lease_owner: string | null
  lease_expires_at: string | null
  heartbeat_at: string | null
  cancellation_requested_at: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

interface AttemptRow {
  id: string
  job_id: string
  attempt_number: number
  worker_id: string
  status: AutomationAttemptStatus
  started_at: string
  completed_at: string | null
  error_code: string | null
  error_message: string | null
  output_json: unknown
}

interface ScheduleRow {
  id: string
  site_id: string | null
  name: string
  job_type: string
  operation_key: string
  payload_json: unknown
  interval_seconds: number
  max_attempts: number
  enabled: boolean
  next_run_at: string
  last_enqueued_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

function mapJob(row: JobRow): AutomationJob {
  return {
    id: row.id,
    siteId: row.site_id,
    scheduleId: row.schedule_id,
    parentJobId: row.parent_job_id,
    jobType: row.job_type,
    operationKey: row.operation_key,
    status: row.status,
    payload: parseJsonRecord(row.payload_json),
    result: parseJsonRecord(row.result_json),
    idempotencyKey: row.idempotency_key,
    requestedByType: row.requested_by_type,
    requestedBy: row.requested_by,
    maxAttempts: row.max_attempts,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    leaseToken: row.lease_token,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    heartbeatAt: row.heartbeat_at,
    cancellationRequestedAt: row.cancellation_requested_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at
  }
}

function mapAttempt(row: AttemptRow): AutomationJobAttempt {
  return {
    id: row.id,
    jobId: row.job_id,
    attemptNumber: row.attempt_number,
    workerId: row.worker_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    output: parseJsonRecord(row.output_json)
  }
}

function mapSchedule(row: ScheduleRow): AutomationSchedule {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    jobType: row.job_type,
    operationKey: row.operation_key,
    payload: parseJsonRecord(row.payload_json),
    intervalSeconds: row.interval_seconds,
    maxAttempts: row.max_attempts,
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    lastEnqueuedAt: row.last_enqueued_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class AutomationRepository {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  getDatabase(): QueryExecutor | TransactionalQueryExecutor {
    return this.database
  }

  async enqueue(job: AutomationJob): Promise<{ job: AutomationJob, created: boolean }> {
    const result = await this.database.query<JobRow>(`
      INSERT INTO automation_jobs (
        id, site_id, schedule_id, parent_job_id, job_type, operation_key,
        status, payload_json, result_json, idempotency_key,
        requested_by_type, requested_by, max_attempts, attempt_count,
        available_at, lease_token, lease_owner, lease_expires_at, heartbeat_at,
        cancellation_requested_at, error_code, error_message, created_at,
        started_at, completed_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `, [
      job.id, job.siteId, job.scheduleId, job.parentJobId, job.jobType,
      job.operationKey, job.status, JSON.stringify(job.payload),
      JSON.stringify(job.result), job.idempotencyKey, job.requestedByType,
      job.requestedBy, job.maxAttempts, job.attemptCount, job.availableAt,
      job.leaseToken, job.leaseOwner, job.leaseExpiresAt, job.heartbeatAt,
      job.cancellationRequestedAt, job.errorCode, job.errorMessage,
      job.createdAt, job.startedAt, job.completedAt, job.updatedAt
    ])
    if (result.rows[0]) return { job: mapJob(result.rows[0]), created: true }
    const existing = await this.findByIdempotencyKey(job.idempotencyKey)
    if (!existing) throw new Error('The idempotent automation job could not be resolved.')
    return { job: existing, created: false }
  }

  async findById(id: string): Promise<AutomationJob | null> {
    const result = await this.database.query<JobRow>('SELECT * FROM automation_jobs WHERE id = $1', [id])
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<AutomationJob | null> {
    const result = await this.database.query<JobRow>(
      'SELECT * FROM automation_jobs WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async list(options: {
    siteId?: string | null
    status?: AutomationJobStatus
    limit?: number
  } = {}): Promise<AutomationJob[]> {
    const values: unknown[] = []
    const clauses: string[] = []
    if (options.siteId !== undefined) {
      values.push(options.siteId)
      clauses.push(options.siteId === null ? 'site_id IS NULL' : `site_id = $${values.length}`)
      if (options.siteId === null) values.pop()
    }
    if (options.status) {
      values.push(options.status)
      clauses.push(`status = $${values.length}`)
    }
    values.push(Math.min(500, Math.max(1, options.limit ?? 100)))
    const result = await this.database.query<JobRow>(`
      SELECT * FROM automation_jobs
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `, values)
    return result.rows.map(mapJob)
  }

  async listAttempts(jobId: string): Promise<AutomationJobAttempt[]> {
    const result = await this.database.query<AttemptRow>(`
      SELECT * FROM automation_job_attempts
      WHERE job_id = $1
      ORDER BY attempt_number DESC
    `, [jobId])
    return result.rows.map(mapAttempt)
  }

  async claimNext(now: string, workerId: string, leaseExpiresAt: string): Promise<ClaimedAutomationJob | null> {
    return this.withTransaction(async executor => {
      const candidates = await executor.query<JobRow>(`
        SELECT *
        FROM automation_jobs
        WHERE status = 'queued'
          AND available_at <= $1
          AND cancellation_requested_at IS NULL
        ORDER BY available_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 25
      `, [now])

      for (const row of candidates.rows) {
        const leaseToken = randomUUID()
        const scopeKey = row.site_id ? `site:${row.site_id}` : 'system'
        const lock = await executor.query<{ job_id: string }>(`
          INSERT INTO automation_operation_locks (
            scope_key, operation_key, job_id, lease_token, lease_expires_at,
            acquired_at, heartbeat_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (scope_key, operation_key) DO UPDATE
          SET job_id = EXCLUDED.job_id,
              lease_token = EXCLUDED.lease_token,
              lease_expires_at = EXCLUDED.lease_expires_at,
              acquired_at = EXCLUDED.acquired_at,
              heartbeat_at = EXCLUDED.heartbeat_at
          WHERE automation_operation_locks.lease_expires_at <= $6
          RETURNING job_id
        `, [scopeKey, row.operation_key, row.id, leaseToken, leaseExpiresAt, now])
        if (!lock.rows[0]) continue

        const claimed = await executor.query<JobRow>(`
          UPDATE automation_jobs
          SET status = 'preflight',
              attempt_count = attempt_count + 1,
              lease_token = $2,
              lease_owner = $3,
              lease_expires_at = $4,
              heartbeat_at = $5,
              started_at = COALESCE(started_at, $5),
              error_code = NULL,
              error_message = NULL,
              updated_at = $5
          WHERE id = $1 AND status = 'queued'
          RETURNING *
        `, [row.id, leaseToken, workerId, leaseExpiresAt, now])
        if (!claimed.rows[0]) {
          await executor.query('DELETE FROM automation_operation_locks WHERE job_id = $1 AND lease_token = $2', [row.id, leaseToken])
          continue
        }
        await executor.query(`
          INSERT INTO automation_job_attempts (
            id, job_id, attempt_number, worker_id, status, started_at,
            completed_at, error_code, error_message, output_json
          ) VALUES ($1, $2, $3, $4, 'preflight', $5, NULL, NULL, NULL, '{}'::jsonb)
        `, [randomUUID(), row.id, claimed.rows[0].attempt_count, workerId, now])
        return mapJob(claimed.rows[0]) as ClaimedAutomationJob
      }
      return null
    })
  }

  async transitionActive(
    jobId: string,
    leaseToken: string,
    fromStatus: AutomationActiveStatus,
    toStatus: AutomationActiveStatus,
    now: string
  ): Promise<void> {
    const result = await this.database.query(`
      UPDATE automation_jobs
      SET status = $4, updated_at = $5
      WHERE id = $1 AND lease_token = $2 AND status = $3
    `, [jobId, leaseToken, fromStatus, toStatus, now])
    if (result.rowCount !== 1) throw new Error('The automation job lease is no longer valid.')
    await this.database.query(`
      UPDATE automation_job_attempts
      SET status = $2
      WHERE job_id = $1 AND attempt_number = (
        SELECT attempt_count FROM automation_jobs WHERE id = $1
      ) AND completed_at IS NULL
    `, [jobId, toStatus])
  }

  async heartbeat(jobId: string, leaseToken: string, now: string, leaseExpiresAt: string): Promise<boolean> {
    return this.withTransaction(async executor => {
      const result = await executor.query(`
        UPDATE automation_jobs
        SET heartbeat_at = $3, lease_expires_at = $4, updated_at = $3
        WHERE id = $1
          AND lease_token = $2
          AND status IN ('preflight', 'running', 'verifying')
      `, [jobId, leaseToken, now, leaseExpiresAt])
      if (result.rowCount !== 1) return false
      await executor.query(`
        UPDATE automation_operation_locks
        SET heartbeat_at = $3, lease_expires_at = $4
        WHERE job_id = $1 AND lease_token = $2
      `, [jobId, leaseToken, now, leaseExpiresAt])
      return true
    })
  }

  async isCancellationRequested(jobId: string, leaseToken: string): Promise<boolean> {
    const result = await this.database.query<{ cancellation_requested_at: string | null }>(`
      SELECT cancellation_requested_at
      FROM automation_jobs
      WHERE id = $1 AND lease_token = $2
    `, [jobId, leaseToken])
    if (!result.rows[0]) throw new Error('The automation job lease is no longer valid.')
    return Boolean(result.rows[0].cancellation_requested_at)
  }

  async finishSucceeded(
    jobId: string,
    leaseToken: string,
    result: Record<string, unknown>,
    now: string
  ): Promise<void> {
    await this.finishClaim(jobId, leaseToken, 'succeeded', 'succeeded', result, null, null, null, now)
  }

  async finishClaim(
    jobId: string,
    leaseToken: string,
    status: Extract<AutomationJobStatus, 'queued' | 'failed' | 'needs-attention' | 'cancelled' | 'succeeded'>,
    attemptStatus: Extract<AutomationAttemptStatus, 'succeeded' | 'failed' | 'cancelled'>,
    output: Record<string, unknown>,
    errorCode: string | null,
    errorMessage: string | null,
    availableAt: string | null,
    now: string
  ): Promise<void> {
    await this.withTransaction(async executor => {
      const result = await executor.query<JobRow>(`
        UPDATE automation_jobs
        SET status = $3::text,
            result_json = $4::jsonb,
            available_at = COALESCE($5::timestamptz, available_at),
            lease_token = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            heartbeat_at = $6::timestamptz,
            error_code = $7::text,
            error_message = $8::text,
            completed_at = CASE WHEN $3::text = 'queued' THEN NULL ELSE $6::timestamptz END,
            updated_at = $6::timestamptz
        WHERE id = $1
          AND lease_token = $2
          AND status IN ('preflight', 'running', 'verifying')
        RETURNING *
      `, [
        jobId, leaseToken, status, JSON.stringify(output), availableAt, now,
        errorCode, errorMessage?.slice(0, 2000) ?? null
      ])
      if (!result.rows[0]) throw new Error('The automation job lease is no longer valid.')
      await executor.query(`
        UPDATE automation_job_attempts
        SET status = $3,
            completed_at = $4,
            error_code = $5,
            error_message = $6,
            output_json = $7::jsonb
        WHERE job_id = $1 AND attempt_number = $2 AND completed_at IS NULL
      `, [
        jobId, result.rows[0].attempt_count, attemptStatus, now, errorCode,
        errorMessage?.slice(0, 2000) ?? null, JSON.stringify(output)
      ])
      await executor.query('DELETE FROM automation_operation_locks WHERE job_id = $1 AND lease_token = $2', [jobId, leaseToken])
    })
  }

  async recoverStale(now: string): Promise<AutomationJob[]> {
    return this.withTransaction(async executor => {
      const result = await executor.query<JobRow>(`
        SELECT * FROM automation_jobs
        WHERE status IN ('preflight', 'running', 'verifying')
          AND lease_expires_at <= $1
        ORDER BY lease_expires_at ASC
        FOR UPDATE SKIP LOCKED
      `, [now])
      const recovered: AutomationJob[] = []
      for (const row of result.rows) {
        const retry = row.attempt_count < row.max_attempts
        const status: AutomationJobStatus = retry ? 'queued' : 'needs-attention'
        const message = 'Worker lease expired before the job completed.'
        const updated = await executor.query<JobRow>(`
          UPDATE automation_jobs
          SET status = $2::text,
              available_at = $3::timestamptz,
              lease_token = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              error_code = 'worker-interrupted',
              error_message = $4,
              completed_at = CASE WHEN $2::text = 'queued' THEN NULL ELSE $3::timestamptz END,
              updated_at = $3::timestamptz
          WHERE id = $1
          RETURNING *
        `, [row.id, status, now, message])
        await executor.query(`
          UPDATE automation_job_attempts
          SET status = 'interrupted', completed_at = $3,
              error_code = 'worker-interrupted', error_message = $4
          WHERE job_id = $1 AND attempt_number = $2 AND completed_at IS NULL
        `, [row.id, row.attempt_count, now, message])
        await executor.query('DELETE FROM automation_operation_locks WHERE job_id = $1', [row.id])
        if (updated.rows[0]) recovered.push(mapJob(updated.rows[0]))
      }
      return recovered
    })
  }

  async requestCancellation(jobId: string, now: string): Promise<AutomationJob> {
    return this.withTransaction(async executor => {
      const current = await executor.query<JobRow>('SELECT * FROM automation_jobs WHERE id = $1 FOR UPDATE', [jobId])
      const row = current.rows[0]
      if (!row) throw new Error('Automation job not found.')
      if (['succeeded', 'failed', 'needs-attention', 'cancelled'].includes(row.status)) {
        throw new Error('Only queued or active automation jobs can be cancelled.')
      }
      const result = row.status === 'queued'
        ? await executor.query<JobRow>(`
            UPDATE automation_jobs
            SET status = 'cancelled', cancellation_requested_at = $2,
                completed_at = $2, updated_at = $2
            WHERE id = $1 RETURNING *
          `, [jobId, now])
        : await executor.query<JobRow>(`
            UPDATE automation_jobs
            SET cancellation_requested_at = $2, updated_at = $2
            WHERE id = $1 RETURNING *
          `, [jobId, now])
      return mapJob(result.rows[0]!)
    })
  }

  async retry(jobId: string, additionalAttempts: number, now: string): Promise<AutomationJob> {
    const result = await this.database.query<JobRow>(`
      UPDATE automation_jobs
      SET status = 'queued',
          max_attempts = LEAST(20, attempt_count + $2),
          available_at = $3,
          cancellation_requested_at = NULL,
          error_code = NULL,
          error_message = NULL,
          completed_at = NULL,
          updated_at = $3
      WHERE id = $1 AND status IN ('failed', 'needs-attention')
      RETURNING *
    `, [jobId, additionalAttempts, now])
    if (!result.rows[0]) throw new Error('Only failed or needs-attention jobs can be retried.')
    return mapJob(result.rows[0])
  }

  async saveSchedule(schedule: AutomationSchedule): Promise<AutomationSchedule> {
    const result = await this.database.query<ScheduleRow>(`
      INSERT INTO automation_schedules (
        id, site_id, name, job_type, operation_key, payload_json,
        interval_seconds, max_attempts, enabled, next_run_at,
        last_enqueued_at, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE
      SET site_id = EXCLUDED.site_id,
          name = EXCLUDED.name,
          job_type = EXCLUDED.job_type,
          operation_key = EXCLUDED.operation_key,
          payload_json = EXCLUDED.payload_json,
          interval_seconds = EXCLUDED.interval_seconds,
          max_attempts = EXCLUDED.max_attempts,
          enabled = EXCLUDED.enabled,
          next_run_at = EXCLUDED.next_run_at,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      schedule.id, schedule.siteId, schedule.name, schedule.jobType,
      schedule.operationKey, JSON.stringify(schedule.payload),
      schedule.intervalSeconds, schedule.maxAttempts, schedule.enabled,
      schedule.nextRunAt, schedule.lastEnqueuedAt, schedule.createdBy,
      schedule.createdAt, schedule.updatedAt
    ])
    return mapSchedule(result.rows[0]!)
  }

  async findSchedule(id: string): Promise<AutomationSchedule | null> {
    const result = await this.database.query<ScheduleRow>('SELECT * FROM automation_schedules WHERE id = $1', [id])
    return result.rows[0] ? mapSchedule(result.rows[0]) : null
  }

  async listSchedules(): Promise<AutomationSchedule[]> {
    const result = await this.database.query<ScheduleRow>('SELECT * FROM automation_schedules ORDER BY name, id')
    return result.rows.map(mapSchedule)
  }

  async listDueSchedulesForUpdate(now: string, limit: number): Promise<AutomationSchedule[]> {
    const result = await this.database.query<ScheduleRow>(`
      SELECT * FROM automation_schedules
      WHERE enabled = TRUE AND next_run_at <= $1
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $2
    `, [now, limit])
    return result.rows.map(mapSchedule)
  }

  async markScheduleEnqueued(id: string, dueAt: string, nextRunAt: string, now: string): Promise<void> {
    await this.database.query(`
      UPDATE automation_schedules
      SET last_enqueued_at = $2, next_run_at = $3, updated_at = $4
      WHERE id = $1 AND next_run_at = $2
    `, [id, dueAt, nextRunAt, now])
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
