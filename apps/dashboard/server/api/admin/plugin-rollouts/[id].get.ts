import { handleApiError } from '../../../utils/api'
import { getPluginRolloutService } from '../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    if (!id) throw new Error('Rollout ID is required.')
    return { ok: true, data: await getPluginRolloutService(event).get(id) }
  } catch (error) { handleApiError(error) }
})
