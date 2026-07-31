import { randomUUID } from 'node:crypto'
import type { ClaimedEmailOutboxMessage, EmailOutboxMessage } from '../email/types'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface EmailOutboxRow {
  id: string
  message_type: string
  site_id: string | null
  notification_category: EmailOutboxMessage['notificationCategory']
  provider: EmailOutboxMessage['provider']
  recipient_email: string
  recipient_name: string | null
  subject: string
  text_content: string
  html_content: string
  template_key: string | null
  metadata_json: unknown
  artifact_reference: string | null
  status: EmailOutboxMessage['status']
  idempotency_key: string
  attempt_count: number
  max_attempts: number
  available_at: string
  claimed_at: string | null
  lease_token: string | null
  lease_expires_at: string | null
  sent_at: string | null
  delivered_at: string | null
  bounced_at: string | null
  suppressed_at: string | null
  completed_at: string | null
  provider_message_id: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

function mapMessage(row: EmailOutboxRow): EmailOutboxMessage {
  return {
    id: row.id,
    messageType: row.message_type,
    siteId: row.site_id,
    notificationCategory: row.notification_category,
    provider: row.provider,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    subject: row.subject,
    textContent: row.text_content,
    htmlContent: row.html_content,
    templateKey: row.template_key,
    metadata: parseJsonRecord(row.metadata_json),
    artifactReference: row.artifact_reference,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    claimedAt: row.claimed_at,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    bouncedAt: row.bounced_at,
    suppressedAt: row.suppressed_at,
    completedAt: row.completed_at,
    providerMessageId: row.provider_message_id,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class EmailOutboxRepository {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  getDatabase(): QueryExecutor | TransactionalQueryExecutor {
    return this.database
  }

  async enqueue(message: EmailOutboxMessage): Promise<{ message: EmailOutboxMessage, created: boolean }> {
    const result = await this.database.query<EmailOutboxRow>(`
      INSERT INTO email_outbox (
        id, message_type, site_id, notification_category, provider,
        recipient_email, recipient_name, subject, text_content, html_content,
        template_key, metadata_json, artifact_reference, status,
        idempotency_key, attempt_count, max_attempts, available_at,
        claimed_at, lease_token, lease_expires_at, sent_at, delivered_at,
        bounced_at, suppressed_at, completed_at, provider_message_id,
        last_error, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, LOWER($6), $7, $8, $9, $10, $11,
        $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29, $30
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `, [
      message.id, message.messageType, message.siteId,
      message.notificationCategory, message.provider, message.recipientEmail,
      message.recipientName ?? null, message.subject, message.textContent,
      message.htmlContent, message.templateKey, JSON.stringify(message.metadata),
      message.artifactReference, message.status, message.idempotencyKey,
      message.attemptCount, message.maxAttempts, message.availableAt,
      message.claimedAt, message.leaseToken, message.leaseExpiresAt,
      message.sentAt, message.deliveredAt, message.bouncedAt,
      message.suppressedAt, message.completedAt, message.providerMessageId,
      message.lastError, message.createdAt, message.updatedAt
    ])
    if (result.rows[0]) return { message: mapMessage(result.rows[0]), created: true }
    const existing = await this.findByIdempotencyKey(message.idempotencyKey)
    if (!existing) throw new Error('The idempotent email message could not be resolved.')
    return { message: existing, created: false }
  }

  async findById(id: string): Promise<EmailOutboxMessage | null> {
    const result = await this.database.query<EmailOutboxRow>('SELECT * FROM email_outbox WHERE id = $1', [id])
    return result.rows[0] ? mapMessage(result.rows[0]) : null
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<EmailOutboxMessage | null> {
    const result = await this.database.query<EmailOutboxRow>(
      'SELECT * FROM email_outbox WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    return result.rows[0] ? mapMessage(result.rows[0]) : null
  }

  async list(options: { siteId?: string, status?: EmailOutboxMessage['status'], limit?: number } = {}): Promise<EmailOutboxMessage[]> {
    const values: unknown[] = []
    const clauses: string[] = []
    if (options.siteId) {
      values.push(options.siteId)
      clauses.push(`site_id = $${values.length}`)
    }
    if (options.status) {
      values.push(options.status)
      clauses.push(`status = $${values.length}`)
    }
    values.push(Math.min(500, Math.max(1, options.limit ?? 100)))
    const result = await this.database.query<EmailOutboxRow>(`
      SELECT * FROM email_outbox
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `, values)
    return result.rows.map(mapMessage)
  }

  async claim(now: string, leaseExpiresAt: string): Promise<ClaimedEmailOutboxMessage | null> {
    return this.withTransaction(async executor => {
      await executor.query(`
        UPDATE email_outbox message
        SET status = 'suppressed',
            suppressed_at = $1,
            completed_at = $1,
            text_content = '',
            html_content = '',
            last_error = 'Recipient is on the email suppression list.',
            updated_at = $1
        FROM email_suppressions suppression
        WHERE LOWER(message.recipient_email) = LOWER(suppression.recipient_email)
          AND suppression.lifted_at IS NULL
          AND message.status IN ('pending', 'failed')
      `, [now])
      const candidate = await executor.query<{ id: string }>(`
        SELECT id
        FROM email_outbox
        WHERE status IN ('pending', 'failed')
          AND available_at <= $1
          AND attempt_count < max_attempts
        ORDER BY available_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `, [now])
      const id = candidate.rows[0]?.id
      if (!id) return null
      const leaseToken = randomUUID()
      const result = await executor.query<EmailOutboxRow>(`
        UPDATE email_outbox
        SET status = 'sending',
            claimed_at = $2,
            lease_token = $3,
            lease_expires_at = $4,
            attempt_count = attempt_count + 1,
            last_error = NULL,
            updated_at = $2
        WHERE id = $1 AND status IN ('pending', 'failed')
        RETURNING *
      `, [id, now, leaseToken, leaseExpiresAt])
      return result.rows[0] ? mapMessage(result.rows[0]) as ClaimedEmailOutboxMessage : null
    })
  }

  async recoverStale(now: string): Promise<number> {
    const result = await this.database.query(`
      UPDATE email_outbox
      SET status = 'failed',
          lease_token = NULL,
          lease_expires_at = NULL,
          available_at = $1,
          completed_at = CASE WHEN attempt_count >= max_attempts THEN $1 ELSE NULL END,
          last_error = 'Email worker lease expired before provider acceptance.',
          updated_at = $1
      WHERE status = 'sending' AND lease_expires_at <= $1
    `, [now])
    return result.rowCount ?? 0
  }

  async markSent(id: string, leaseToken: string, sentAt: string, providerMessageId: string): Promise<void> {
    const result = await this.database.query(`
      UPDATE email_outbox
      SET status = 'sent',
          sent_at = $3,
          completed_at = $3,
          provider_message_id = $4,
          text_content = '',
          html_content = '',
          lease_token = NULL,
          lease_expires_at = NULL,
          last_error = NULL,
          updated_at = $3
      WHERE id = $1 AND lease_token = $2 AND status = 'sending'
    `, [id, leaseToken, sentAt, providerMessageId])
    if (result.rowCount !== 1) throw new Error('The email delivery lease is no longer valid.')
  }

  async markFailed(id: string, leaseToken: string, error: string, availableAt: string, now: string): Promise<void> {
    const result = await this.database.query(`
      UPDATE email_outbox
      SET status = 'failed',
          last_error = $3::text,
          available_at = $4::timestamptz,
          completed_at = CASE WHEN attempt_count >= max_attempts THEN $5::timestamptz ELSE NULL END,
          text_content = CASE WHEN attempt_count >= max_attempts THEN '' ELSE text_content END,
          html_content = CASE WHEN attempt_count >= max_attempts THEN '' ELSE html_content END,
          lease_token = NULL,
          lease_expires_at = NULL,
          updated_at = $5::timestamptz
      WHERE id = $1 AND lease_token = $2 AND status = 'sending'
    `, [id, leaseToken, error.slice(0, 2000), availableAt, now])
    if (result.rowCount !== 1) throw new Error('The email delivery lease is no longer valid.')
  }

  async applyProviderEvent(input: {
    provider: EmailOutboxMessage['provider']
    providerMessageId: string | null
    recipientEmail: string
    eventType: string
    occurredAt: string
  }): Promise<string | null> {
    const status = deliveryStatus(input.eventType)
    if (!status || !input.providerMessageId) return null
    const result = await this.database.query<{ id: string }>(`
      UPDATE email_outbox
      SET status = $4,
          delivered_at = CASE WHEN $4 = 'delivered' THEN $5 ELSE delivered_at END,
          bounced_at = CASE WHEN $4 = 'bounced' THEN $5 ELSE bounced_at END,
          suppressed_at = CASE WHEN $4 = 'suppressed' THEN $5 ELSE suppressed_at END,
          completed_at = $5,
          text_content = '',
          html_content = '',
          updated_at = $5
      WHERE provider = $1
        AND provider_message_id = $2
        AND LOWER(recipient_email) = LOWER($3)
        AND ($4::text <> 'delivered' OR status IN ('sent', 'delivered'))
      RETURNING id
    `, [input.provider, input.providerMessageId, input.recipientEmail, status, input.occurredAt])
    return result.rows[0]?.id ?? null
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

function deliveryStatus(eventType: string): EmailOutboxMessage['status'] | null {
  if (eventType === 'delivered') return 'delivered'
  if (['hard_bounce', 'soft_bounce', 'error'].includes(eventType)) return 'bounced'
  if (['blocked', 'invalid', 'invalid_email', 'spam', 'complaint', 'unsubscribed'].includes(eventType)) return 'suppressed'
  return null
}
