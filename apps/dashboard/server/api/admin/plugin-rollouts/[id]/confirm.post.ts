import { handleApiError } from '../../../../utils/api'
import { requireAccessIdentity } from '../../../../utils/auth'
import { getPluginRolloutService } from '../../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const identity = requireAccessIdentity(event)
    const body = await readBody<Record<string, unknown>>(event)
    if (!id || typeof body.challengeToken !== 'string' || typeof body.code !== 'string') {
      throw new Error('Rollout ID, email challenge, and verification code are required.')
    }
    return {
      ok: true,
      data: await getPluginRolloutService(event).confirm(
        id,
        { userId: identity.userId, email: identity.email },
        { challengeToken: body.challengeToken, code: body.code }
      )
    }
  } catch (error) { handleApiError(error) }
})
