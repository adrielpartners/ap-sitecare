import { isEmailProviderName } from '../../../email/notification-types'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../../utils/api'
import { getEmailConfigurationService } from '../../../utils/email-services'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const selectedProvider = requireBodyString(body, 'selectedProvider')
    if (!isEmailProviderName(selectedProvider)) {
      throw createError({ statusCode: 400, statusMessage: 'A valid email provider is required.' })
    }
    return {
      ok: true,
      data: await getEmailConfigurationService(event).saveGlobal({
        selectedProvider,
        fromAddress: requireBodyString(body, 'fromAddress'),
        fromName: requireBodyString(body, 'fromName'),
        replyTo: optionalBodyString(body, 'replyTo'),
        branding: body.branding && typeof body.branding === 'object'
          ? body.branding as Record<string, unknown>
          : {}
      }, getDashboardActor(event))
    }
  } catch (error) {
    handleApiError(error)
  }
})
