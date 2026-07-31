import type { EmailProviderName, NotificationCategory } from './notification-types'

export const emailOutboxStatuses = [
  'pending',
  'sending',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'suppressed',
  'cancelled'
] as const

export type EmailOutboxStatus = typeof emailOutboxStatuses[number]

export interface EmailMessage {
  recipientEmail: string
  recipientName?: string | null
  subject: string
  textContent: string
  htmlContent: string
  trackingId?: string
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ messageId: string }>
}

export interface EmailOutboxMessage extends EmailMessage {
  id: string
  messageType: string
  siteId: string | null
  notificationCategory: NotificationCategory
  provider: EmailProviderName
  templateKey: string | null
  metadata: Record<string, unknown>
  artifactReference: string | null
  status: EmailOutboxStatus
  idempotencyKey: string
  attemptCount: number
  maxAttempts: number
  availableAt: string
  claimedAt: string | null
  leaseToken: string | null
  leaseExpiresAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  bouncedAt: string | null
  suppressedAt: string | null
  completedAt: string | null
  providerMessageId: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface ClaimedEmailOutboxMessage extends EmailOutboxMessage {
  leaseToken: string
  leaseExpiresAt: string
}
