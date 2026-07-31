import type { ActionRequest, ActionRequestStatus } from '../domain/types'
import { useDatabase, type QueryExecutor } from '../utils/database'

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
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async create(request: ActionRequest): Promise<ActionRequest> {
    await this.database.query(`
      INSERT INTO action_requests (
        id, site_id, action_type, rationale, status, requested_by,
        reviewed_by, review_note, created_at, reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      request.id, request.siteId, request.actionType, request.rationale,
      request.status, request.requestedBy, request.reviewedBy,
      request.reviewNote, request.createdAt, request.reviewedAt
    ])
    return request
  }

  async findById(id: string): Promise<ActionRequest | null> {
    const result = await this.database.query<ActionRequestRow>(
      'SELECT * FROM action_requests WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapRow(result.rows[0]) : null
  }

  async list(): Promise<ActionRequest[]> {
    const result = await this.database.query<ActionRequestRow>(
      'SELECT * FROM action_requests ORDER BY created_at DESC'
    )
    return result.rows.map(mapRow)
  }

  async listScoped(siteIds: string[]): Promise<ActionRequest[]> {
    if (siteIds.length === 0) return []
    const result = await this.database.query<ActionRequestRow>(`
      SELECT * FROM action_requests
      WHERE site_id = ANY($1::text[])
      ORDER BY created_at DESC
    `, [siteIds])
    return result.rows.map(mapRow)
  }

  async update(request: ActionRequest): Promise<ActionRequest> {
    await this.database.query(`
      UPDATE action_requests
      SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = $5
      WHERE id = $1
    `, [
      request.id, request.status, request.reviewedBy,
      request.reviewNote, request.reviewedAt
    ])
    return request
  }
}
