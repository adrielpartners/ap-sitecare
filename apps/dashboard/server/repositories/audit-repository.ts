import type { AuditEvent } from '../domain/types'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface AuditRow {
  id: string
  site_id: string | null
  actor_type: string
  actor_identifier: string | null
  event_type: string
  metadata_json: unknown
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
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async create(event: AuditEvent): Promise<AuditEvent> {
    await this.database.query(`
      INSERT INTO audit_events (
        id, site_id, actor_type, actor_identifier, event_type, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `, [
      event.id, event.siteId, event.actorType, event.actorIdentifier,
      event.eventType, JSON.stringify(event.metadata), event.createdAt
    ])
    return event
  }

  async listForSite(siteId: string): Promise<AuditEvent[]> {
    const result = await this.database.query<AuditRow>(`
      SELECT * FROM audit_events WHERE site_id = $1 ORDER BY created_at DESC
    `, [siteId])
    return result.rows.map(mapAuditEvent)
  }

  async list(limit?: number): Promise<AuditEvent[]> {
    const result = limit === undefined
      ? await this.database.query<AuditRow>('SELECT * FROM audit_events ORDER BY created_at DESC')
      : await this.database.query<AuditRow>('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1', [limit])
    return result.rows.map(mapAuditEvent)
  }

  async listScoped(siteIds: string[], limit?: number): Promise<AuditEvent[]> {
    if (siteIds.length === 0) return []
    const result = limit === undefined
      ? await this.database.query<AuditRow>(`
          SELECT * FROM audit_events
          WHERE site_id = ANY($1::text[])
          ORDER BY created_at DESC
        `, [siteIds])
      : await this.database.query<AuditRow>(`
          SELECT * FROM audit_events
          WHERE site_id = ANY($1::text[])
          ORDER BY created_at DESC
          LIMIT $2
        `, [siteIds, limit])
    return result.rows.map(mapAuditEvent)
  }
}
