import type Database from 'better-sqlite3'
import type { ActionRequest, ActionRequestStatus } from '../domain/types'
import { useDatabase } from '../utils/database'

interface ActionRequestRow {
  id: string
  site_id: string
  action_type: string
  rationale: string
  status: ActionRequestStatus
  requested_by: string
  reviewed_by: string | null
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

function mapRow(row: ActionRequestRow): ActionRequest {
  return {
    id: row.id,
    siteId: row.site_id,
    actionType: row.action_type,
    rationale: row.rationale,
    status: row.status,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  }
}

export class ActionRequestRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  create(request: ActionRequest): ActionRequest {
    this.database.prepare(`
      INSERT INTO action_requests (
        id, site_id, action_type, rationale, status, requested_by,
        reviewed_by, review_note, created_at, reviewed_at
      ) VALUES (
        @id, @siteId, @actionType, @rationale, @status, @requestedBy,
        @reviewedBy, @reviewNote, @createdAt, @reviewedAt
      )
    `).run(request)
    return request
  }

  findById(id: string): ActionRequest | null {
    const row = this.database.prepare('SELECT * FROM action_requests WHERE id = ?').get(id) as ActionRequestRow | undefined
    return row ? mapRow(row) : null
  }

  list(): ActionRequest[] {
    return (this.database.prepare('SELECT * FROM action_requests ORDER BY created_at DESC').all() as ActionRequestRow[]).map(mapRow)
  }

  update(request: ActionRequest): ActionRequest {
    this.database.prepare(`
      UPDATE action_requests
      SET status = @status, reviewed_by = @reviewedBy, review_note = @reviewNote, reviewed_at = @reviewedAt
      WHERE id = @id
    `).run(request)
    return request
  }
}
