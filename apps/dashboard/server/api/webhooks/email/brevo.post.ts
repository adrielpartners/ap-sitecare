import { EmailWebhookService } from '../../../services/notification-service'
import { getEmailConfigurationService } from '../../../utils/email-services'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const authorization = getHeader(event, 'authorization') ?? ''
    const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!await getEmailConfigurationService(event).verifyWebhookBearerToken('brevo', suppliedToken)) {
      throw createError({ statusCode: 401, statusMessage: 'Webhook authentication failed.' })
    }
    const body = await readBody<Record<string, unknown>>(event)
    return { ok: true, data: await new EmailWebhookService().recordBrevo(body) }
  } catch (error) {
    handleApiError(error)
  }
})
