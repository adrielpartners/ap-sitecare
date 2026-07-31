import { isEmailProviderName } from '../../../../email/notification-types'
import { getDashboardActor, handleApiError, optionalBodyString } from '../../../../utils/api'
import { getEmailConfigurationService } from '../../../../utils/email-services'

export default defineEventHandler(async (event) => {
  try {
    const provider = getRouterParam(event, 'provider')
    if (!isEmailProviderName(provider)) {
      throw createError({ statusCode: 400, statusMessage: 'A valid email provider is required.' })
    }
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: await getEmailConfigurationService(event).saveProvider({
        provider,
        apiKey: optionalBodyString(body, 'apiKey'),
        webhookToken: optionalBodyString(body, 'webhookToken'),
        configuration: body.configuration && typeof body.configuration === 'object'
          ? body.configuration as Record<string, unknown>
          : undefined
      }, getDashboardActor(event))
    }
  } catch (error) {
    handleApiError(error)
  }
})
