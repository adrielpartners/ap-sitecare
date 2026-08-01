import { getDashboardActor, handleApiError } from '../../../../../../utils/api'
import { getPluginRolloutService } from '../../../../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const targetId = getRouterParam(event, 'targetId')
    if (!id || !targetId) throw new Error('Rollout and target IDs are required.')
    return { ok: true, data: await getPluginRolloutService(event).retryTarget(id, targetId, getDashboardActor(event)) }
  } catch (error) { handleApiError(error) }
})
