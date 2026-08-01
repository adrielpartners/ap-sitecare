import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { getPluginRolloutService } from '../../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody<Record<string, unknown>>(event)
    if (!id || !Array.isArray(body.targetIds) || body.targetIds.some(value => typeof value !== 'string')) throw new Error('Valid rollout and target IDs are required.')
    return { ok: true, data: await getPluginRolloutService(event).select(id, body.targetIds as string[], getDashboardActor(event)) }
  } catch (error) { handleApiError(error) }
})
