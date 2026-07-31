export const emailProviders = ['brevo', 'mailgun', 'postmark', 'sendgrid'] as const
export type EmailProviderName = typeof emailProviders[number]

export const notificationCategories = [
  'authentication',
  'backup',
  'uptime',
  'updates',
  'sitehealth',
  'security',
  'service',
  'system'
] as const
export type NotificationCategory = typeof notificationCategories[number]
export type SiteNotificationCategory = Exclude<NotificationCategory, 'authentication' | 'system'>

export interface EmailGlobalSettings {
  selectedProvider: EmailProviderName
  fromAddress: string
  fromName: string
  replyTo: string | null
  branding: Record<string, unknown>
  source: 'database' | 'runtime'
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface EmailProviderConfiguration {
  provider: EmailProviderName
  apiKeyConfigured: boolean
  webhookTokenConfigured: boolean
  configuration: Record<string, unknown>
  operational: boolean
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface SiteNotificationRecipient {
  id: string
  siteId: string
  email: string
  displayName: string | null
  enabled: boolean
  categories: SiteNotificationCategory[]
  createdAt: string
  updatedAt: string
}

export interface EmailDeliveryEvent {
  id: string
  provider: EmailProviderName
  providerEventId: string
  providerMessageId: string | null
  outboxId: string | null
  recipientEmail: string
  eventType: string
  occurredAt: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface NotificationChannelAdapter {
  channel: 'email' | 'telegram' | 'sms'
  operational: boolean
}

export function isEmailProviderName(value: unknown): value is EmailProviderName {
  return typeof value === 'string' && emailProviders.includes(value as EmailProviderName)
}

export function isSiteNotificationCategory(value: unknown): value is SiteNotificationCategory {
  return typeof value === 'string'
    && notificationCategories.includes(value as NotificationCategory)
    && value !== 'authentication'
    && value !== 'system'
}
