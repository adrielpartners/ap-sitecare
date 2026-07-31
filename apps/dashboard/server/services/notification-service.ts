import { randomUUID } from 'node:crypto'
import {
  isSiteNotificationCategory,
  type EmailDeliveryEvent,
  type EmailProviderName,
  type SiteNotificationCategory,
  type SiteNotificationRecipient
} from '../email/notification-types'
import type { EmailMessage } from '../email/types'
import { AuditRepository } from '../repositories/audit-repository'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { NotificationRepository } from '../repositories/notification-repository'
import { SiteRepository } from '../repositories/site-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EmailOutboxService } from './email-outbox-service'

export interface SaveSiteNotificationRecipientInput {
  id?: string
  email: string
  displayName?: string | null
  enabled: boolean
  categories: SiteNotificationCategory[]
}

export class NotificationService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async listRecipients(siteId: string): Promise<SiteNotificationRecipient[]> {
    await this.requireSite(siteId)
    return new NotificationRepository(this.database).listRecipients(siteId)
  }

  async saveRecipient(
    siteId: string,
    input: SaveSiteNotificationRecipientInput,
    actorIdentifier: string
  ): Promise<SiteNotificationRecipient> {
    await this.requireSite(siteId)
    const email = validEmail(input.email)
    const displayName = optionalText(input.displayName, 160)
    const categories = [...new Set(input.categories)]
    if (!categories.length) throw new Error('Select at least one email category for the recipient.')
    if (categories.some(category => !isSiteNotificationCategory(category))) {
      throw new Error('Unsupported site notification category.')
    }
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const repository = new NotificationRepository(executor)
      const existing = input.id ? await repository.findRecipient(siteId, input.id) : null
      if (input.id && !existing) throw new Error('Notification recipient not found.')
      const recipient: SiteNotificationRecipient = {
        id: existing?.id ?? randomUUID(),
        siteId,
        email,
        displayName,
        enabled: input.enabled,
        categories,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      await repository.saveRecipient(recipient)
      await repository.replaceRecipientCategories(recipient.id, categories, now)
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: existing ? 'notification.recipient.updated' : 'notification.recipient.created',
        metadata: { recipientId: recipient.id, categories, enabled: recipient.enabled }
      })
      return (await repository.findRecipient(siteId, recipient.id))!
    })
  }

  async deleteRecipient(siteId: string, recipientId: string, actorIdentifier: string): Promise<void> {
    await this.requireSite(siteId)
    await this.withTransaction(async executor => {
      const repository = new NotificationRepository(executor)
      if (!await repository.deleteRecipient(siteId, recipientId)) throw new Error('Notification recipient not found.')
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'notification.recipient.deleted',
        metadata: { recipientId }
      })
    })
  }

  async enqueueForSite(
    siteId: string,
    category: SiteNotificationCategory,
    eventKey: string,
    message: Omit<EmailMessage, 'recipientEmail' | 'recipientName'>,
    options: { messageType: string, templateKey?: string | null, metadata?: Record<string, unknown>, artifactReference?: string | null }
  ): Promise<{ recipientCount: number, messageIds: string[] }> {
    if (!isSiteNotificationCategory(category)) throw new Error('Unsupported site notification category.')
    await this.requireSite(siteId)
    return this.withTransaction(async executor => {
      const repository = new NotificationRepository(executor)
      const recipients = (await repository.listRecipients(siteId, category))
        .filter(recipient => recipient.enabled)
      const outbox = new EmailOutboxService(new EmailOutboxRepository(executor))
      const messageIds: string[] = []
      for (const recipient of recipients) {
        if (await repository.isSuppressed(recipient.email)) continue
        const queued = await outbox.enqueue(
          options.messageType,
          `${eventKey}:${recipient.id}`,
          {
            ...message,
            recipientEmail: recipient.email,
            recipientName: recipient.displayName
          },
          {
            siteId,
            notificationCategory: category,
            templateKey: options.templateKey,
            metadata: options.metadata,
            artifactReference: options.artifactReference
          }
        )
        messageIds.push(queued.id)
      }
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: 'system',
        actorIdentifier: 'notification-service',
        eventType: 'notification.messages.queued',
        metadata: { category, eventKey, recipientCount: messageIds.length, messageIds }
      })
      return { recipientCount: messageIds.length, messageIds }
    })
  }

  private async requireSite(siteId: string): Promise<void> {
    if (!await new SiteRepository(this.database).findById(siteId)) throw new Error('Site not found.')
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

export class EmailWebhookService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async recordBrevo(payload: Record<string, unknown>): Promise<{ duplicate: boolean, event: EmailDeliveryEvent }> {
    const provider: EmailProviderName = 'brevo'
    const eventType = normalizedEvent(requiredString(payload.event, 'Brevo event'))
    const recipientEmail = validEmail(requiredString(payload.email, 'Brevo recipient'))
    const providerMessageId = optionalString(payload['message-id'])
    const providerEventId = [
      String(payload.id ?? 'unknown'),
      eventType,
      providerMessageId ?? 'no-message',
      String(payload.ts_event ?? payload.ts_epoch ?? payload.ts ?? 'no-time')
    ].join(':')
    const occurredAt = webhookDate(payload)
    const now = new Date().toISOString()

    return this.withTransaction(async executor => {
      const outboxRepository = new EmailOutboxRepository(executor)
      const notificationRepository = new NotificationRepository(executor)
      const outboxId = await outboxRepository.applyProviderEvent({
        provider,
        providerMessageId,
        recipientEmail,
        eventType,
        occurredAt
      })
      const event: EmailDeliveryEvent = {
        id: randomUUID(),
        provider,
        providerEventId,
        providerMessageId,
        outboxId,
        recipientEmail,
        eventType,
        occurredAt,
        metadata: {
          reason: optionalString(payload.reason),
          tags: Array.isArray(payload.tags) ? payload.tags.filter(item => typeof item === 'string').slice(0, 20) : []
        },
        createdAt: now
      }
      const created = await notificationRepository.createDeliveryEvent(event)
      if (created && shouldSuppress(eventType)) {
        await notificationRepository.suppress(recipientEmail, eventType, 'brevo-webhook', occurredAt)
      }
      if (created) {
        const message = outboxId ? await outboxRepository.findById(outboxId) : null
        await new AuditService(new AuditRepository(executor)).record({
          siteId: message?.siteId ?? null,
          actorType: 'email-provider',
          actorIdentifier: 'brevo-webhook',
          eventType: 'email.delivery-event.received',
          metadata: { outboxId, providerMessageId, eventType, recipientSuppressed: shouldSuppress(eventType) }
        })
      }
      return { duplicate: !created, event: { ...event, outboxId } }
    })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

function validEmail(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('A valid recipient email address is required.')
  }
  return normalized
}

function optionalText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.trim()
  if (!normalized) return null
  if (normalized.length > maximum || /[\r\n]/.test(normalized)) throw new Error('Recipient name contains unsupported characters.')
  return normalized
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  return value
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null
}

function normalizedEvent(value: string): string {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
}

function webhookDate(payload: Record<string, unknown>): string {
  const timestamp = Number(payload.ts_event ?? payload.ts)
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp * 1000).toISOString()
  const epoch = Number(payload.ts_epoch)
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch).toISOString()
  return new Date().toISOString()
}

function shouldSuppress(eventType: string): boolean {
  return [
    'hard_bounce',
    'invalid',
    'invalid_email',
    'blocked',
    'spam',
    'complaint',
    'unsubscribed'
  ].includes(eventType)
}
