import { randomUUID } from 'node:crypto'
import type { AuditEvent } from '../domain/types'
import { AuditRepository } from '../repositories/audit-repository'

export interface RecordAuditEventInput {
  siteId?: string | null
  actorType: string
  actorIdentifier?: string | null
  eventType: string
  metadata?: Record<string, unknown>
}

export class AuditService {
  constructor(private readonly auditRepository = new AuditRepository()) {}

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    return this.auditRepository.create({
      id: randomUUID(),
      siteId: input.siteId ?? null,
      actorType: input.actorType,
      actorIdentifier: input.actorIdentifier ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString()
    })
  }

  async list(limit?: number, siteIds: string[] | null = null): Promise<AuditEvent[]> {
    return siteIds === null
      ? this.auditRepository.list(limit)
      : this.auditRepository.listScoped(siteIds, limit)
  }

  async listForSite(siteId: string): Promise<AuditEvent[]> {
    return this.auditRepository.listForSite(siteId)
  }
}
