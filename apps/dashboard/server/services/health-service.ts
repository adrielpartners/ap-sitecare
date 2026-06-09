import { randomUUID } from 'node:crypto'
import type { HealthStatus, SiteCheckIn, SiteHealthSnapshot } from '../domain/types'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { checkDatabaseConnection } from '../repositories/system-repository'
import { AuditService } from './audit-service'

export interface SystemHealth {
  database: 'connected'
  service: 'ap-sitecare-dashboard'
}

export interface RecordCheckInInput {
  siteId: string
  source?: string
  requestTimestamp?: string | null
  payload?: Record<string, unknown>
  status: HealthStatus
  wordpressVersion?: string | null
  phpVersion?: string | null
  pluginUpdateCount?: number
  themeUpdateCount?: number
  lastCronRunAt?: string | null
}

export class HealthService {
  constructor(
    private readonly checkInRepository = new CheckInRepository(),
    private readonly siteRepository = new SiteRepository(),
    private readonly auditService = new AuditService()
  ) {}

  recordCheckIn(input: RecordCheckInInput): { checkIn: SiteCheckIn, snapshot: SiteHealthSnapshot } {
    if (!this.siteRepository.findById(input.siteId)) throw new Error('Site not found.')

    const now = new Date().toISOString()
    const checkIn = this.checkInRepository.createCheckIn({
      id: randomUUID(),
      siteId: input.siteId,
      receivedAt: now,
      source: input.source ?? 'wordpress-plugin',
      requestTimestamp: input.requestTimestamp ?? null,
      payload: input.payload ?? {}
    })
    const snapshot = this.checkInRepository.createSnapshot({
      id: randomUUID(),
      siteId: input.siteId,
      checkInId: checkIn.id,
      status: input.status,
      wordpressVersion: input.wordpressVersion ?? null,
      phpVersion: input.phpVersion ?? null,
      pluginUpdateCount: input.pluginUpdateCount ?? 0,
      themeUpdateCount: input.themeUpdateCount ?? 0,
      lastCronRunAt: input.lastCronRunAt ?? null,
      createdAt: now
    })
    this.auditService.record({
      siteId: input.siteId,
      actorType: 'wordpress-plugin',
      eventType: 'check-in.received',
      metadata: { checkInId: checkIn.id, status: snapshot.status }
    })
    return { checkIn, snapshot }
  }

  getLatestSnapshot(siteId: string): SiteHealthSnapshot | null {
    return this.checkInRepository.findLatestSnapshot(siteId)
  }
}

export function getSystemHealth(): SystemHealth {
  checkDatabaseConnection()
  return { database: 'connected', service: 'ap-sitecare-dashboard' }
}
