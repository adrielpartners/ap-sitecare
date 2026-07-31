import type { H3Event } from 'h3'
import type { EmailProviderName } from '../email/notification-types'

export interface RuntimeSettings {
  auth: {
    secureCookies: boolean
    eventHashKey: string
    sessionDays: number
  }
  sitecareBaseUrl: string
  email: {
    provider: EmailProviderName
    brevoApiKey: string
    fromAddress: string
    fromName: string
    replyTo: string
    webhookBearerToken: string
  }
  integrations: {
    cloudflareApiToken: string
    cloudflareApiBaseUrl: string
    cloudflareWebhookSecret: string
    cloudflareAccountId: string
    cloudflareWebhookDestinationId: string
    cloudflareNotificationPolicyId: string
    dropboxAccessToken: string
    dropboxBackupRoot: string
    hostingerApiBaseUrl: string
    hostingerApiToken: string
  }
  backups: {
    allowedLocalBaseDirectories: string
    dropboxAccountLabel: string
    dropboxEnabled: boolean
    dropboxTokenStrategy: 'runtime-access-token' | 'oauth'
  }
  credentialEncryptionKey: string
  databaseUrl: string
}

export function getRuntimeSettings(event?: H3Event): RuntimeSettings {
  return useRuntimeConfig(event) as unknown as RuntimeSettings
}
