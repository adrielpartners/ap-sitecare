import type Database from 'better-sqlite3'
import type { AuditEvent } from '../domain/types'
import { useDatabase } from '../utils/database'
import { parseJsonRecord, stringifyRecord } from '../utils/records'

interface AuditRow {
  id: string
  site_id: string | null
  actor_type: string
  actor_identifier: string | null
  event_type: string
  metadata_json: string
  created_at: string
}

function mapAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    siteId: row.site_id,
    actorType: row.actor_type,
    actorIdentifier: row.actor_identifier,
    eventType: row.event_type,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at
  }
}

export class AuditRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  create(event: AuditEvent): AuditEvent {
    this.database.prepare(`
      INSERT INTO audit_events (
        id, site_id, actor_type, actor_identifier, event_type, metadata_json, created_at
      ) VALUES (
        @id, @siteId, @actorType, @actorIdentifier, @eventType, @metadataJson, @createdAt
      )
    `).run({ ...event, metadataJson: stringifyRecord(event.metadata) })
    return event
  }

  listForSite(siteId: string): AuditEvent[] {
    return (this.database.prepare(`
      SELECT * FROM audit_events WHERE site_id = ? ORDER BY created_at DESC
    `).all(siteId) as AuditRow[]).map(mapAuditEvent)
  }
}
