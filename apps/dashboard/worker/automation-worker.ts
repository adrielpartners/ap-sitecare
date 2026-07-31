import { setTimeout as delay } from 'node:timers/promises'
import { AutomationRepository } from '../server/repositories/automation-repository'
import {
  AutomationWorkerService,
  SchedulerService,
  createCoreAutomationHandlers
} from '../server/services/automation-service'
import { AuditRepository } from '../server/repositories/audit-repository'
import { AuditService } from '../server/services/audit-service'
import { createDatabase } from '../server/utils/database'

const databaseUrl = process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'
const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-automation-worker' })
const leaseSeconds = integerSetting(process.env.NUXT_AUTOMATION_LEASE_SECONDS, 120, 30, 3600)
const heartbeatSeconds = integerSetting(process.env.NUXT_AUTOMATION_HEARTBEAT_SECONDS, 30, 5, leaseSeconds - 1)
const retryBaseSeconds = integerSetting(process.env.NUXT_AUTOMATION_RETRY_BASE_SECONDS, 30, 1, 3600)
const pollSeconds = integerSetting(process.env.NUXT_AUTOMATION_POLL_SECONDS, 5, 1, 60)
const repository = new AutomationRepository(database)
const scheduler = new SchedulerService(database)
const worker = new AutomationWorkerService(
  repository,
  createCoreAutomationHandlers(database),
  new AuditService(new AuditRepository(database)),
  { leaseSeconds, heartbeatSeconds, retryBaseSeconds }
)
const continuous = process.argv.includes('--continuous')
let stopping = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true
  })
}

try {
  do {
    await scheduler.ensureEntitlementSchedules()
    await scheduler.ensurePhaseFiveSchedules()
    await scheduler.ensurePhaseSixSchedules()
    await scheduler.ensurePhaseSevenSchedules()
    await scheduler.tick()
    const handled = await worker.runNext()
    if (!continuous || stopping) break
    if (!handled) await delay(pollSeconds * 1000)
  } while (!stopping)
} finally {
  await database.close()
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Automation worker setting must be a whole number from ${minimum} to ${maximum}.`)
  }
  return parsed
}
