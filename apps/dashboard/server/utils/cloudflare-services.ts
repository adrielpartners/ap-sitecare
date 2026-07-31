import type { H3Event } from 'h3'
import { CloudflareClient } from '../integrations/cloudflare-client'
import { CloudflareService } from '../services/cloudflare-service'
import { getRuntimeSettings } from './config'

export function useCloudflareService(event?: H3Event): CloudflareService {
  const settings = getRuntimeSettings(event)
  return new CloudflareService(new CloudflareClient(
    settings.integrations.cloudflareApiToken,
    fetch,
    settings.integrations.cloudflareApiBaseUrl
  ), undefined, undefined, {
    accountId: settings.integrations.cloudflareAccountId,
    webhookDestinationId: settings.integrations.cloudflareWebhookDestinationId,
    notificationPolicyId: settings.integrations.cloudflareNotificationPolicyId,
    webhookSecretConfigured: Boolean(settings.integrations.cloudflareWebhookSecret)
  })
}
