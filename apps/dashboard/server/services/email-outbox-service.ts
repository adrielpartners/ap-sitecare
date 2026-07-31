import { randomUUID } from 'node:crypto'
import type { ClaimedEmailOutboxMessage, EmailMessage, EmailOutboxMessage, EmailProvider } from '../email/types'
import type { EmailProviderName, NotificationCategory } from '../email/notification-types'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { NotificationRepository } from '../repositories/notification-repository'

export interface EnqueueEmailOptions {
  siteId?: string | null
  notificationCategory?: NotificationCategory
  templateKey?: string | null
  metadata?: Record<string, unknown>
  artifactReference?: string | null
  maxAttempts?: number
  provider?: EmailProviderName
}

export class EmailOutboxService {
  constructor(
    private readonly repository = new EmailOutboxRepository(),
    private readonly providerSelection?: () => Promise<EmailProviderName>
  ) {}

  async enqueue(
    messageType: string,
    idempotencyKey: string,
    message: EmailMessage,
    options: EnqueueEmailOptions = {}
  ): Promise<EmailOutboxMessage> {
    const now = new Date().toISOString()
    const provider = options.provider ?? await this.selectedProvider()
    const maxAttempts = options.maxAttempts ?? 5
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error('Email maximum attempts must be a whole number from 1 to 20.')
    }
    const metadata = safeMetadata(options.metadata ?? {})
    const result = await this.repository.enqueue({
      id: randomUUID(),
      messageType: requiredText(messageType, 'Message type', 160),
      siteId: options.siteId ?? null,
      notificationCategory: options.notificationCategory ?? 'authentication',
      provider,
      recipientEmail: validEmail(message.recipientEmail),
      recipientName: optionalText(message.recipientName, 160),
      subject: requiredText(message.subject, 'Email subject', 300),
      textContent: boundedBody(message.textContent),
      htmlContent: boundedBody(message.htmlContent),
      templateKey: optionalText(options.templateKey, 160),
      metadata,
      artifactReference: optionalText(options.artifactReference, 500),
      status: 'pending',
      idempotencyKey: requiredText(idempotencyKey, 'Email idempotency key', 300),
      attemptCount: 0,
      maxAttempts,
      availableAt: now,
      claimedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      sentAt: null,
      deliveredAt: null,
      bouncedAt: null,
      suppressedAt: null,
      completedAt: null,
      providerMessageId: null,
      lastError: null,
      createdAt: now,
      updatedAt: now
    })
    return result.message
  }

  private async selectedProvider(): Promise<EmailProviderName> {
    if (this.providerSelection) return this.providerSelection()
    const settings = await new NotificationRepository(this.repository.getDatabase()).findGlobalSettings()
    return settings?.selectedProvider ?? 'brevo'
  }
}

export interface EmailProviderResolver {
  resolveProvider(provider: EmailProviderName): Promise<EmailProvider>
}

export class EmailOutboxWorkerService {
  constructor(
    private readonly repository: EmailOutboxRepository,
    private readonly providerOrResolver: EmailProvider | EmailProviderResolver,
    private readonly leaseSeconds = 120
  ) {}

  async runOnce(): Promise<boolean> {
    const now = new Date()
    await this.repository.recoverStale(now.toISOString())
    const message = await this.repository.claim(
      now.toISOString(),
      new Date(now.getTime() + this.leaseSeconds * 1000).toISOString()
    )
    if (!message) return false
    try {
      const provider = await this.provider(message.provider)
      const result = await provider.send({
        recipientEmail: message.recipientEmail,
        recipientName: message.recipientName,
        subject: message.subject,
        textContent: message.textContent,
        htmlContent: message.htmlContent,
        trackingId: `sitecare-outbox-${message.id}`
      })
      await this.repository.markSent(message.id, message.leaseToken, new Date().toISOString(), result.messageId)
    } catch (error) {
      const retryDelayMinutes = Math.min(60, 2 ** Math.min(message.attemptCount, 6))
      const failedAt = new Date()
      const availableAt = new Date(failedAt.getTime() + retryDelayMinutes * 60_000).toISOString()
      await this.repository.markFailed(
        message.id,
        message.leaseToken,
        safeFailure(error),
        availableAt,
        failedAt.toISOString()
      )
    }
    return true
  }

  private async provider(provider: EmailProviderName): Promise<EmailProvider> {
    if ('resolveProvider' in this.providerOrResolver) {
      return this.providerOrResolver.resolveProvider(provider)
    }
    return this.providerOrResolver
  }
}

function validEmail(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Recipient email must be a valid email address.')
  }
  return normalized
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maximum || /[\r\n]/.test(normalized)) throw new Error(`${label} contains unsupported characters.`)
  return normalized
}

function optionalText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.trim()
  if (!normalized) return null
  if (normalized.length > maximum || /[\r\n]/.test(normalized)) throw new Error('Email metadata contains unsupported characters.')
  return normalized
}

function boundedBody(value: string): string {
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('Email content must not exceed 1 MB.')
  return value
}

function safeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(value)
  if (serialized.length > 32_768) throw new Error('Email metadata must not exceed 32 KiB.')
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (!item || typeof item !== 'object') return
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      if (/(password|secret|token|credential|authorization|api[-_]?key)/i.test(key)) {
        throw new Error('Email metadata cannot contain credentials or tokens.')
      }
      visit(entry)
    }
  }
  visit(value)
  return value
}

function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown email delivery error.'
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 2000)
}

export type { ClaimedEmailOutboxMessage }
