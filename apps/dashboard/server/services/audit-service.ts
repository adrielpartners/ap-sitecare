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

  record(input: RecordAuditEventInput): AuditEvent {
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
}
