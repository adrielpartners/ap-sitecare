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

export interface SiteHealthSummary {
  siteId: string
  status: HealthStatus
  reason: string
  latest: SiteHealthSnapshot | null
}

export function calculateSnapshotStatus(pluginUpdateCount: number, themeUpdateCount: number): HealthStatus {
  if (pluginUpdateCount + themeUpdateCount > 0) return 'attention'
  return 'healthy'
}

export class HealthService {
  constructor(
    private readonly checkInRepository = new CheckInRepository(),
    private readonly siteRepository = new SiteRepository(),
    private readonly auditService = new AuditService()
  ) {}

  async recordCheckIn(input: RecordCheckInInput): Promise<{ checkIn: SiteCheckIn, snapshot: SiteHealthSnapshot }> {
    if (!await this.siteRepository.findById(input.siteId)) throw new Error('Site not found.')

    const now = new Date().toISOString()
    const checkIn = await this.checkInRepository.createCheckIn({
      id: randomUUID(),
      siteId: input.siteId,
      receivedAt: now,
      source: input.source ?? 'wordpress-plugin',
      requestTimestamp: input.requestTimestamp ?? null,
      payload: input.payload ?? {}
    })
    const snapshot = await this.checkInRepository.createSnapshot({
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
    await this.auditService.record({
      siteId: input.siteId,
      actorType: 'wordpress-plugin',
      eventType: 'check-in.received',
      metadata: { checkInId: checkIn.id, status: snapshot.status }
    })
    return { checkIn, snapshot }
  }

  async getLatestSnapshot(siteId: string): Promise<SiteHealthSnapshot | null> {
    return this.checkInRepository.findLatestSnapshot(siteId)
  }

  async getSummary(siteId: string, now = new Date()): Promise<SiteHealthSummary> {
    if (!await this.siteRepository.findById(siteId)) throw new Error('Site not found.')
    const latest = await this.getLatestSnapshot(siteId)
    if (!latest) return { siteId, status: 'unknown', reason: 'No check-in received', latest: null }

    const ageMs = now.getTime() - new Date(latest.createdAt).getTime()
    if (ageMs > 72 * 60 * 60 * 1000) {
      return { siteId, status: 'critical', reason: 'Check-in is more than 72 hours old', latest }
    }
    if (ageMs > 24 * 60 * 60 * 1000) {
      return { siteId, status: 'attention', reason: 'Check-in is more than 24 hours old', latest }
    }

    const totalUpdates = latest.pluginUpdateCount + latest.themeUpdateCount
    if (latest.status === 'attention') {
      return { siteId, status: 'attention', reason: `${totalUpdates} updates available`, latest }
    }
    return { siteId, status: 'healthy', reason: 'Reporting normally with no updates', latest }
  }

  async listSummaries(now = new Date(), siteIds: string[] | null = null): Promise<SiteHealthSummary[]> {
    const sites = siteIds === null
      ? await this.siteRepository.list()
      : await this.siteRepository.listByIds(siteIds)
    return Promise.all(sites.map(site => this.getSummary(site.id, now)))
  }

  async listCheckIns(siteId: string): Promise<SiteCheckIn[]> {
    if (!await this.siteRepository.findById(siteId)) throw new Error('Site not found.')
    return this.checkInRepository.listForSite(siteId)
  }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  await checkDatabaseConnection()
  return { database: 'connected', service: 'ap-sitecare-dashboard' }
}
