import type {
  SiteHealthAnnualPolicy,
  SiteHealthApproval,
  SiteHealthCheckup,
  SiteHealthCleanupProposal,
  SiteHealthEvidence,
  SiteHealthFinding,
  SiteHealthRecommendation,
  SiteHealthReview
} from '../domain/sitehealth'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

type Row = Record<string, unknown>

export class SiteHealthRepository {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async createCheckup(checkup: SiteHealthCheckup): Promise<SiteHealthCheckup> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_checkups (
        id, site_id, trigger_type, annual_cycle_date, status, include_broken_links,
        requested_by_type, requested_by, automation_job_id, evidence_check_in_id,
        started_at, completed_at, error_message, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (site_id, annual_cycle_date) WHERE trigger_type = 'annual'
      DO UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      checkup.id, checkup.siteId, checkup.triggerType, checkup.annualCycleDate,
      checkup.status, checkup.includeBrokenLinks, checkup.requestedByType,
      checkup.requestedBy, checkup.automationJobId, checkup.evidenceCheckInId,
      checkup.startedAt, checkup.completedAt, checkup.errorMessage,
      checkup.createdAt, checkup.updatedAt
    ])
    return mapCheckup(result.rows[0]!)
  }

  async updateCheckup(checkup: SiteHealthCheckup): Promise<SiteHealthCheckup> {
    const result = await this.database.query<Row>(`
      UPDATE sitehealth_checkups SET
        status = $2, include_broken_links = $3, automation_job_id = $4,
        evidence_check_in_id = $5, started_at = $6, completed_at = $7,
        error_message = $8, updated_at = $9
      WHERE id = $1
      RETURNING *
    `, [
      checkup.id, checkup.status, checkup.includeBrokenLinks,
      checkup.automationJobId, checkup.evidenceCheckInId, checkup.startedAt,
      checkup.completedAt, checkup.errorMessage, checkup.updatedAt
    ])
    if (!result.rows[0]) throw new Error('SiteHealth Checkup not found.')
    return mapCheckup(result.rows[0])
  }

  async findCheckup(checkupId: string): Promise<SiteHealthCheckup | null> {
    const result = await this.database.query<Row>('SELECT * FROM sitehealth_checkups WHERE id = $1', [checkupId])
    return result.rows[0] ? mapCheckup(result.rows[0]) : null
  }

  async listCheckups(siteIds: string[] | null = null, limit = 200): Promise<SiteHealthCheckup[]> {
    if (siteIds?.length === 0) return []
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_checkups
      WHERE ($1::text[] IS NULL OR site_id = ANY($1::text[]))
      ORDER BY created_at DESC
      LIMIT $2
    `, [siteIds, Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapCheckup)
  }

  async findLatestCompletedCheckup(siteId: string, triggerType?: 'annual'): Promise<SiteHealthCheckup | null> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_checkups
      WHERE site_id = $1 AND status = 'draft-ready'
        AND ($2::text IS NULL OR trigger_type = $2)
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `, [siteId, triggerType ?? null])
    return result.rows[0] ? mapCheckup(result.rows[0]) : null
  }

  async saveAnnualPolicy(policy: SiteHealthAnnualPolicy): Promise<SiteHealthAnnualPolicy> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_annual_policies (
        site_id, enabled, eligible_at, next_due_at, last_completed_at,
        last_checkup_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (site_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        eligible_at = EXCLUDED.eligible_at,
        next_due_at = EXCLUDED.next_due_at,
        last_completed_at = EXCLUDED.last_completed_at,
        last_checkup_id = EXCLUDED.last_checkup_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      policy.siteId, policy.enabled, policy.eligibleAt, policy.nextDueAt,
      policy.lastCompletedAt, policy.lastCheckupId, policy.createdAt, policy.updatedAt
    ])
    return mapPolicy(result.rows[0]!)
  }

  async findAnnualPolicy(siteId: string): Promise<SiteHealthAnnualPolicy | null> {
    const result = await this.database.query<Row>('SELECT * FROM sitehealth_annual_policies WHERE site_id = $1', [siteId])
    return result.rows[0] ? mapPolicy(result.rows[0]) : null
  }

  async listDueAnnualPolicies(at: string, limit = 100): Promise<SiteHealthAnnualPolicy[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_annual_policies
      WHERE enabled = TRUE AND next_due_at IS NOT NULL AND next_due_at <= $1
      ORDER BY next_due_at ASC LIMIT $2
    `, [at, Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapPolicy)
  }

  async replaceEvidence(checkupId: string, evidence: SiteHealthEvidence[]): Promise<void> {
    await this.withTransaction(async executor => {
      await executor.query('DELETE FROM sitehealth_evidence WHERE checkup_id = $1', [checkupId])
      for (const item of evidence) {
        await executor.query(`
          INSERT INTO sitehealth_evidence (
            id, checkup_id, site_id, area, metric_key, source, availability,
            summary, value_json, observed_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        `, [
          item.id, item.checkupId, item.siteId, item.area, item.metricKey,
          item.source, item.availability, item.summary, JSON.stringify(item.value),
          item.observedAt, item.createdAt
        ])
      }
    })
  }

  async listEvidence(checkupId: string): Promise<SiteHealthEvidence[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_evidence WHERE checkup_id = $1 ORDER BY area, metric_key
    `, [checkupId])
    return result.rows.map(mapEvidence)
  }

  async replaceAutomatedFindings(checkupId: string, findings: SiteHealthFinding[]): Promise<void> {
    await this.withTransaction(async executor => {
      await executor.query("DELETE FROM sitehealth_findings WHERE checkup_id = $1 AND origin = 'automated'", [checkupId])
      for (const finding of findings) await insertFinding(executor, finding)
    })
  }

  async saveFinding(finding: SiteHealthFinding): Promise<SiteHealthFinding> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_findings (
        id, checkup_id, site_id, evidence_id, area, title, description,
        severity, origin, status, technician_notes, sort_order, created_by,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        area = EXCLUDED.area, title = EXCLUDED.title, description = EXCLUDED.description,
        severity = EXCLUDED.severity, status = EXCLUDED.status,
        technician_notes = EXCLUDED.technician_notes, sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, findingValues(finding))
    return mapFinding(result.rows[0]!)
  }

  async listFindings(checkupId: string): Promise<SiteHealthFinding[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_findings WHERE checkup_id = $1
      ORDER BY status, sort_order, created_at
    `, [checkupId])
    return result.rows.map(mapFinding)
  }

  async replaceAutomatedRecommendations(checkupId: string, recommendations: SiteHealthRecommendation[]): Promise<void> {
    await this.withTransaction(async executor => {
      await executor.query("DELETE FROM sitehealth_recommendations WHERE checkup_id = $1 AND created_by = 'system:sitehealth'", [checkupId])
      for (const recommendation of recommendations) await insertRecommendation(executor, recommendation)
    })
  }

  async saveRecommendation(recommendation: SiteHealthRecommendation): Promise<SiteHealthRecommendation> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_recommendations (
        id, checkup_id, site_id, area, action_type, title, description,
        priority, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        area = EXCLUDED.area, action_type = EXCLUDED.action_type,
        title = EXCLUDED.title, description = EXCLUDED.description,
        priority = EXCLUDED.priority, status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, recommendationValues(recommendation))
    return mapRecommendation(result.rows[0]!)
  }

  async listRecommendations(checkupId: string): Promise<SiteHealthRecommendation[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_recommendations WHERE checkup_id = $1
      ORDER BY status, CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at
    `, [checkupId])
    return result.rows.map(mapRecommendation)
  }

  async createReview(review: SiteHealthReview): Promise<SiteHealthReview> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_reviews (
        id, checkup_id, site_id, version, status, title, executive_summary,
        content_json, created_by, published_by, published_at, sent_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, reviewValues(review))
    return mapReview(result.rows[0]!)
  }

  async updateReview(review: SiteHealthReview): Promise<SiteHealthReview> {
    const result = await this.database.query<Row>(`
      UPDATE sitehealth_reviews SET
        status = $2, title = $3, executive_summary = $4, content_json = $5::jsonb,
        published_by = $6, published_at = $7, sent_at = $8, updated_at = $9
      WHERE id = $1 RETURNING *
    `, [
      review.id, review.status, review.title, review.executiveSummary,
      JSON.stringify(review.content), review.publishedBy, review.publishedAt,
      review.sentAt, review.updatedAt
    ])
    if (!result.rows[0]) throw new Error('SiteHealth Review not found.')
    return mapReview(result.rows[0])
  }

  async findReview(reviewId: string): Promise<SiteHealthReview | null> {
    const result = await this.database.query<Row>('SELECT * FROM sitehealth_reviews WHERE id = $1', [reviewId])
    return result.rows[0] ? mapReview(result.rows[0]) : null
  }

  async listReviewsForCheckup(checkupId: string): Promise<SiteHealthReview[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_reviews WHERE checkup_id = $1 ORDER BY version DESC
    `, [checkupId])
    return result.rows.map(mapReview)
  }

  async listPublishedReviews(siteIds: string[] | null = null, limit = 200): Promise<SiteHealthReview[]> {
    if (siteIds?.length === 0) return []
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_reviews
      WHERE status IN ('published', 'sent')
        AND ($1::text[] IS NULL OR site_id = ANY($1::text[]))
      ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT $2
    `, [siteIds, Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapReview)
  }

  async supersedePublishedReviews(checkupId: string, exceptReviewId: string, at: string): Promise<void> {
    await this.database.query(`
      UPDATE sitehealth_reviews SET status = 'superseded', updated_at = $3
      WHERE checkup_id = $1 AND id <> $2 AND status IN ('published', 'sent')
    `, [checkupId, exceptReviewId, at])
  }

  async nextReviewVersion(checkupId: string): Promise<number> {
    const result = await this.database.query<{ next_version: number }>(`
      SELECT (COALESCE(MAX(version), 0) + 1)::integer AS next_version
      FROM sitehealth_reviews WHERE checkup_id = $1
    `, [checkupId])
    return result.rows[0]?.next_version ?? 1
  }

  async createApproval(approval: SiteHealthApproval): Promise<SiteHealthApproval> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_approvals (
        id, review_id, site_id, status, source, notes, recorded_by, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [
      approval.id, approval.reviewId, approval.siteId, approval.status,
      approval.source, approval.notes, approval.recordedBy, approval.recordedAt
    ])
    return mapApproval(result.rows[0]!)
  }

  async listApprovals(reviewId: string): Promise<SiteHealthApproval[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_approvals WHERE review_id = $1 ORDER BY recorded_at DESC
    `, [reviewId])
    return result.rows.map(mapApproval)
  }

  async saveCleanupProposal(proposal: SiteHealthCleanupProposal): Promise<SiteHealthCleanupProposal> {
    const result = await this.database.query<Row>(`
      INSERT INTO sitehealth_cleanup_proposals (
        id, review_id, recommendation_id, site_id, action_type, status,
        approval_id, technician_notes, initiated_by, initiated_at,
        completed_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (review_id, recommendation_id) DO UPDATE SET
        status = EXCLUDED.status, approval_id = EXCLUDED.approval_id,
        technician_notes = EXCLUDED.technician_notes,
        initiated_by = EXCLUDED.initiated_by, initiated_at = EXCLUDED.initiated_at,
        completed_at = EXCLUDED.completed_at, updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      proposal.id, proposal.reviewId, proposal.recommendationId, proposal.siteId,
      proposal.actionType, proposal.status, proposal.approvalId,
      proposal.technicianNotes, proposal.initiatedBy, proposal.initiatedAt,
      proposal.completedAt, proposal.createdAt, proposal.updatedAt
    ])
    return mapCleanupProposal(result.rows[0]!)
  }

  async findCleanupProposal(proposalId: string): Promise<SiteHealthCleanupProposal | null> {
    const result = await this.database.query<Row>('SELECT * FROM sitehealth_cleanup_proposals WHERE id = $1', [proposalId])
    return result.rows[0] ? mapCleanupProposal(result.rows[0]) : null
  }

  async listCleanupProposals(reviewId: string): Promise<SiteHealthCleanupProposal[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM sitehealth_cleanup_proposals WHERE review_id = $1 ORDER BY created_at
    `, [reviewId])
    return result.rows.map(mapCleanupProposal)
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

async function insertFinding(executor: QueryExecutor, finding: SiteHealthFinding): Promise<void> {
  await executor.query(`
    INSERT INTO sitehealth_findings (
      id, checkup_id, site_id, evidence_id, area, title, description,
      severity, origin, status, technician_notes, sort_order, created_by,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `, findingValues(finding))
}

function findingValues(finding: SiteHealthFinding): unknown[] {
  return [
    finding.id, finding.checkupId, finding.siteId, finding.evidenceId,
    finding.area, finding.title, finding.description, finding.severity,
    finding.origin, finding.status, finding.technicianNotes, finding.sortOrder,
    finding.createdBy, finding.createdAt, finding.updatedAt
  ]
}

async function insertRecommendation(executor: QueryExecutor, recommendation: SiteHealthRecommendation): Promise<void> {
  await executor.query(`
    INSERT INTO sitehealth_recommendations (
      id, checkup_id, site_id, area, action_type, title, description,
      priority, status, created_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, recommendationValues(recommendation))
}

function recommendationValues(recommendation: SiteHealthRecommendation): unknown[] {
  return [
    recommendation.id, recommendation.checkupId, recommendation.siteId,
    recommendation.area, recommendation.actionType, recommendation.title,
    recommendation.description, recommendation.priority, recommendation.status,
    recommendation.createdBy, recommendation.createdAt, recommendation.updatedAt
  ]
}

function reviewValues(review: SiteHealthReview): unknown[] {
  return [
    review.id, review.checkupId, review.siteId, review.version, review.status,
    review.title, review.executiveSummary, JSON.stringify(review.content),
    review.createdBy, review.publishedBy, review.publishedAt, review.sentAt,
    review.createdAt, review.updatedAt
  ]
}

function text(row: Row, key: string): string { return String(row[key]) }
function optionalText(row: Row, key: string): string | null { return row[key] === null || row[key] === undefined ? null : String(row[key]) }

function mapCheckup(row: Row): SiteHealthCheckup {
  return {
    id: text(row, 'id'), siteId: text(row, 'site_id'),
    triggerType: text(row, 'trigger_type') as SiteHealthCheckup['triggerType'],
    annualCycleDate: optionalText(row, 'annual_cycle_date'),
    status: text(row, 'status') as SiteHealthCheckup['status'],
    includeBrokenLinks: Boolean(row.include_broken_links),
    requestedByType: text(row, 'requested_by_type'), requestedBy: text(row, 'requested_by'),
    automationJobId: optionalText(row, 'automation_job_id'), evidenceCheckInId: optionalText(row, 'evidence_check_in_id'),
    startedAt: optionalText(row, 'started_at'), completedAt: optionalText(row, 'completed_at'),
    errorMessage: optionalText(row, 'error_message'), createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapPolicy(row: Row): SiteHealthAnnualPolicy {
  return {
    siteId: text(row, 'site_id'), enabled: Boolean(row.enabled), eligibleAt: optionalText(row, 'eligible_at'),
    nextDueAt: optionalText(row, 'next_due_at'), lastCompletedAt: optionalText(row, 'last_completed_at'),
    lastCheckupId: optionalText(row, 'last_checkup_id'), createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapEvidence(row: Row): SiteHealthEvidence {
  return {
    id: text(row, 'id'), checkupId: text(row, 'checkup_id'), siteId: text(row, 'site_id'),
    area: text(row, 'area') as SiteHealthEvidence['area'], metricKey: text(row, 'metric_key'),
    source: text(row, 'source'), availability: text(row, 'availability') as SiteHealthEvidence['availability'],
    summary: text(row, 'summary'), value: parseJsonRecord(row.value_json),
    observedAt: optionalText(row, 'observed_at'), createdAt: text(row, 'created_at')
  }
}

function mapFinding(row: Row): SiteHealthFinding {
  return {
    id: text(row, 'id'), checkupId: text(row, 'checkup_id'), siteId: text(row, 'site_id'),
    evidenceId: optionalText(row, 'evidence_id'), area: text(row, 'area') as SiteHealthFinding['area'],
    title: text(row, 'title'), description: text(row, 'description'),
    severity: text(row, 'severity') as SiteHealthFinding['severity'], origin: text(row, 'origin') as SiteHealthFinding['origin'],
    status: text(row, 'status') as SiteHealthFinding['status'], technicianNotes: optionalText(row, 'technician_notes'),
    sortOrder: Number(row.sort_order), createdBy: text(row, 'created_by'), createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapRecommendation(row: Row): SiteHealthRecommendation {
  return {
    id: text(row, 'id'), checkupId: text(row, 'checkup_id'), siteId: text(row, 'site_id'),
    area: text(row, 'area') as SiteHealthRecommendation['area'], actionType: text(row, 'action_type') as SiteHealthRecommendation['actionType'],
    title: text(row, 'title'), description: text(row, 'description'), priority: text(row, 'priority') as SiteHealthRecommendation['priority'],
    status: text(row, 'status') as SiteHealthRecommendation['status'], createdBy: text(row, 'created_by'),
    createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapReview(row: Row): SiteHealthReview {
  return {
    id: text(row, 'id'), checkupId: text(row, 'checkup_id'), siteId: text(row, 'site_id'), version: Number(row.version),
    status: text(row, 'status') as SiteHealthReview['status'], title: text(row, 'title'), executiveSummary: text(row, 'executive_summary'),
    content: parseJsonRecord(row.content_json) as unknown as SiteHealthReview['content'], createdBy: text(row, 'created_by'),
    publishedBy: optionalText(row, 'published_by'), publishedAt: optionalText(row, 'published_at'), sentAt: optionalText(row, 'sent_at'),
    createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapApproval(row: Row): SiteHealthApproval {
  return {
    id: text(row, 'id'), reviewId: text(row, 'review_id'), siteId: text(row, 'site_id'),
    status: text(row, 'status') as SiteHealthApproval['status'], source: text(row, 'source') as SiteHealthApproval['source'],
    notes: text(row, 'notes'), recordedBy: text(row, 'recorded_by'), recordedAt: text(row, 'recorded_at')
  }
}

function mapCleanupProposal(row: Row): SiteHealthCleanupProposal {
  return {
    id: text(row, 'id'), reviewId: text(row, 'review_id'), recommendationId: text(row, 'recommendation_id'), siteId: text(row, 'site_id'),
    actionType: text(row, 'action_type') as SiteHealthCleanupProposal['actionType'], status: text(row, 'status') as SiteHealthCleanupProposal['status'],
    approvalId: optionalText(row, 'approval_id'), technicianNotes: optionalText(row, 'technician_notes'),
    initiatedBy: optionalText(row, 'initiated_by'), initiatedAt: optionalText(row, 'initiated_at'), completedAt: optionalText(row, 'completed_at'),
    createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}
