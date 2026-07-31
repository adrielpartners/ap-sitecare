import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AutomationJobHandler } from '../domain/automation'
import { AuditRepository } from '../repositories/audit-repository'
import { AutomationRepository } from '../repositories/automation-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { PostgresDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import {
  AutomationService,
  AutomationWorkerService,
  SchedulerService
} from './automation-service'
import { SiteService } from './site-service'

let database: PostgresDatabase
let siteId: string

before(async () => {
  database = await createTestDatabase()
  const audit = new AuditService(new AuditRepository(database))
  const site = await new SiteService(new SiteRepository(database), audit).create({
    name: 'Automation Test Site',
    url: 'https://automation.example.com'
  })
  siteId = site.id
})

after(async () => {
  await destroyTestDatabase(database)
})

test('automation jobs are idempotent and operation locks serialize site work', async () => {
  const service = new AutomationService(database)
  const repository = new AutomationRepository(database)
  const first = await service.enqueue({
    siteId,
    jobType: 'test.locked',
    operationKey: 'wordpress-update',
    idempotencyKey: 'automation-lock:first',
    requestedByType: 'test',
    requestedBy: 'test-suite'
  })
  const duplicate = await service.enqueue({
    siteId,
    jobType: 'test.locked',
    operationKey: 'wordpress-update',
    idempotencyKey: 'automation-lock:first',
    requestedByType: 'test',
    requestedBy: 'test-suite'
  })
  const second = await service.enqueue({
    siteId,
    jobType: 'test.locked',
    operationKey: 'wordpress-update',
    idempotencyKey: 'automation-lock:second',
    requestedByType: 'test',
    requestedBy: 'test-suite'
  })

  assert.equal(first.created, true)
  assert.equal(duplicate.created, false)
  assert.equal(duplicate.job.id, first.job.id)

  const now = new Date()
  const leaseExpiry = new Date(now.getTime() + 60_000).toISOString()
  const [claimA, claimB] = await Promise.all([
    repository.claimNext(now.toISOString(), 'worker-a', leaseExpiry),
    repository.claimNext(now.toISOString(), 'worker-b', leaseExpiry)
  ])
  const claimed = claimA ?? claimB
  assert.ok(claimed)
  assert.equal([claimA, claimB].filter(Boolean).length, 1)
  assert.equal(await repository.claimNext(now.toISOString(), 'worker-c', leaseExpiry), null)

  await repository.finishSucceeded(claimed.id, claimed.leaseToken, { complete: true }, new Date().toISOString())
  const next = await repository.claimNext(new Date().toISOString(), 'worker-c', leaseExpiry)
  assert.equal(next?.id, second.job.id)
  assert.ok(next)
  await repository.finishSucceeded(next.id, next.leaseToken, { complete: true }, new Date().toISOString())
})

test('scheduler enqueues due work once and advances the durable schedule', async () => {
  const scheduler = new SchedulerService(database)
  const now = new Date()
  const schedule = await scheduler.save({
    id: 'test:durable-schedule',
    siteId,
    name: 'Durable test schedule',
    jobType: 'test.scheduled',
    operationKey: 'test-scheduled',
    intervalSeconds: 300,
    maxAttempts: 4,
    enabled: true,
    nextRunAt: new Date(now.getTime() - 60_000).toISOString(),
    actorIdentifier: 'test-suite'
  })

  assert.equal(await scheduler.tick(now), 1)
  assert.equal(await scheduler.tick(now), 0)
  const jobs = await new AutomationService(database).list({ siteId })
  const scheduledJobs = jobs.filter(job => job.scheduleId === schedule.id)
  assert.equal(scheduledJobs.length, 1)
  assert.equal(scheduledJobs[0]?.maxAttempts, 4)
  const saved = (await scheduler.list()).find(item => item.id === schedule.id)
  assert.ok(saved?.lastEnqueuedAt)
  assert.ok(new Date(saved.nextRunAt).getTime() > now.getTime())
  const repository = new AutomationRepository(database)
  const claimed = await repository.claimNext(
    new Date().toISOString(),
    'schedule-cleanup-worker',
    new Date(Date.now() + 60_000).toISOString()
  )
  assert.equal(claimed?.scheduleId, schedule.id)
  assert.ok(claimed)
  await repository.finishSucceeded(claimed.id, claimed.leaseToken, {}, new Date().toISOString())
})

test('worker records workflow attempts, retries transient failures, and verifies output', async () => {
  let executionCount = 0
  const handler: AutomationJobHandler = {
    async execute() {
      executionCount += 1
      if (executionCount === 1) throw new Error('Temporary provider outage')
      return { providerAccepted: true }
    },
    async verify(_job, result) {
      return { ...result, verified: true }
    }
  }
  const service = new AutomationService(database)
  const queued = await service.enqueue({
    siteId,
    jobType: 'test.retry',
    operationKey: 'retry-test',
    idempotencyKey: 'automation-retry',
    requestedByType: 'test',
    requestedBy: 'test-suite',
    maxAttempts: 2
  })
  const repository = new AutomationRepository(database)
  const worker = new AutomationWorkerService(
    repository,
    new Map([['test.retry', handler]]),
    new AuditService(new AuditRepository(database)),
    { leaseSeconds: 60, heartbeatSeconds: 30, retryBaseSeconds: 0 },
    'test-worker'
  )

  assert.equal((await worker.runNext())?.status, 'queued')
  assert.equal((await worker.runNext())?.status, 'succeeded')
  const detail = await service.get(queued.job.id)
  assert.deepEqual(detail.job.result, { providerAccepted: true, verified: true })
  assert.deepEqual(detail.attempts.map(attempt => attempt.status), ['succeeded', 'failed'])
})

test('stale leases are recovered and active cancellation is cooperative', async () => {
  const service = new AutomationService(database)
  const repository = new AutomationRepository(database)
  const stale = await service.enqueue({
    siteId,
    jobType: 'test.interrupted',
    operationKey: 'interrupted-test',
    idempotencyKey: 'automation-interrupted',
    requestedByType: 'test',
    requestedBy: 'test-suite',
    maxAttempts: 2
  })
  const now = new Date()
  const claimed = await repository.claimNext(
    now.toISOString(),
    'interrupted-worker',
    new Date(now.getTime() + 1_000).toISOString()
  )
  assert.equal(claimed?.id, stale.job.id)
  const recovered = await repository.recoverStale(new Date(now.getTime() + 2_000).toISOString())
  assert.equal(recovered[0]?.status, 'queued')
  assert.equal((await service.get(stale.job.id)).attempts[0]?.status, 'interrupted')
  await service.cancel(stale.job.id, 'test-suite')

  const cancellable = await service.enqueue({
    siteId,
    jobType: 'test.cancel',
    operationKey: 'cancel-test',
    idempotencyKey: 'automation-cancel',
    requestedByType: 'test',
    requestedBy: 'test-suite'
  })
  const worker = new AutomationWorkerService(
    repository,
    new Map([['test.cancel', {
      async preflight(job) {
        await service.cancel(job.id, 'operator@example.com')
      },
      async execute() {
        assert.fail('Cancelled work must not execute.')
      }
    }]]),
    new AuditService(new AuditRepository(database)),
    { leaseSeconds: 60, heartbeatSeconds: 30, retryBaseSeconds: 0 },
    'cancellation-worker'
  )
  assert.equal((await worker.runNext())?.status, 'cancelled')
  assert.equal((await service.get(cancellable.job.id)).attempts[0]?.status, 'cancelled')
})
