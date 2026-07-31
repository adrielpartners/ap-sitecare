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
  // Workers run from the standalone Node entrypoints rather than inside a
  // Nuxt request. In that process there is no Nuxt runtimeConfig injector, so
  // resolve the same deployment variables directly from the environment.
  if (!event) {
    return runtimeSettingsFromEnvironment()
  }

  return useRuntimeConfig(event) as unknown as RuntimeSettings
}

function runtimeSettingsFromEnvironment(): RuntimeSettings {
  return {
    auth: {
      secureCookies: process.env.NUXT_AUTH_SECURE_COOKIES === 'true',
      eventHashKey: process.env.NUXT_AUTH_EVENT_HASH_KEY || '',
      sessionDays: numberSetting(process.env.NUXT_AUTH_SESSION_DAYS, 30)
    },
    sitecareBaseUrl: process.env.NUXT_SITECARE_BASE_URL || 'http://localhost:3000',
    email: {
      provider: (process.env.NUXT_EMAIL_PROVIDER || 'brevo') as EmailProviderName,
      brevoApiKey: process.env.NUXT_EMAIL_BREVO_API_KEY || '',
      fromAddress: process.env.NUXT_EMAIL_FROM_ADDRESS || '',
      fromName: process.env.NUXT_EMAIL_FROM_NAME || 'SiteCare',
      replyTo: process.env.NUXT_EMAIL_REPLY_TO || '',
      webhookBearerToken: process.env.NUXT_EMAIL_WEBHOOK_BEARER_TOKEN || ''
    },
    integrations: {
      cloudflareApiToken: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_API_TOKEN || '',
      cloudflareApiBaseUrl: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4',
      cloudflareWebhookSecret: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_SECRET || '',
      cloudflareAccountId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_ACCOUNT_ID || '',
      cloudflareWebhookDestinationId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_DESTINATION_ID || '',
      cloudflareNotificationPolicyId: process.env.NUXT_INTEGRATIONS_CLOUDFLARE_NOTIFICATION_POLICY_ID || '',
      dropboxAccessToken: process.env.NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN || '',
      dropboxBackupRoot: process.env.NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT || '',
      hostingerApiBaseUrl: process.env.NUXT_INTEGRATIONS_HOSTINGER_API_BASE_URL || 'https://developers.hostinger.com',
      hostingerApiToken: process.env.NUXT_INTEGRATIONS_HOSTINGER_API_TOKEN || ''
    },
    backups: {
      allowedLocalBaseDirectories: process.env.NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES || '',
      dropboxAccountLabel: process.env.NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL || '',
      dropboxEnabled: process.env.NUXT_BACKUPS_DROPBOX_ENABLED !== 'false',
      dropboxTokenStrategy: process.env.NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY === 'oauth'
        ? 'oauth'
        : 'runtime-access-token'
    },
    credentialEncryptionKey: process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY || '',
    databaseUrl: process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'
  }
}

function numberSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
