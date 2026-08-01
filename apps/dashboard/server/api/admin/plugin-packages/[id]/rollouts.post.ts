import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { getPluginRolloutService } from '../../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    if (!id) throw new Error('Package ID is required.')
    const body = await readBody<Record<string, unknown>>(event)
    return { ok: true, data: await getPluginRolloutService(event).create(id, getDashboardActor(event), {
      canarySize: integer(body.canarySize), failureThreshold: integer(body.failureThreshold), concurrencyLimit: integer(body.concurrencyLimit)
    }) }
  } catch (error) { handleApiError(error) }
})

function integer(value: unknown): number | undefined { return typeof value === 'number' && Number.isInteger(value) ? value : undefined }
