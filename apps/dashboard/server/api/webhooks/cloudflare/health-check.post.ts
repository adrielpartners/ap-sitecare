import { verifyCloudflareWebhookSecret } from '../../../services/cloudflare-service'
import { useCloudflareService } from '../../../utils/cloudflare-services'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  const received = getHeader(event, 'cf-webhook-auth')
  const expected = getRuntimeSettings(event).integrations.cloudflareWebhookSecret
  if (!verifyCloudflareWebhookSecret(received, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Cloudflare webhook authentication failed.' })
  }
  const payload = await readBody<Record<string, unknown>>(event)
  try {
    return { data: await useCloudflareService(event).processWebhook(payload) }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Cloudflare webhook processing failed.'
    })
  }
})
