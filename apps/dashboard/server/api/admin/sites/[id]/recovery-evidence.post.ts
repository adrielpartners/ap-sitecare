import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { getPluginRolloutService } from '../../../../utils/plugin-updates'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody<Record<string, unknown>>(event)
    if (!id || typeof body.backupReference !== 'string' || typeof body.backupCompletedAt !== 'string' || typeof body.validUntil !== 'string') throw new Error('Site, backup reference, completion time, and validity date are required.')
    return { ok: true, data: await getPluginRolloutService(event).recordRecoveryEvidence(id, {
      backupReference: body.backupReference, backupCompletedAt: body.backupCompletedAt,
      validUntil: body.validUntil, notes: typeof body.notes === 'string' ? body.notes : undefined
    }, getDashboardActor(event)) }
  } catch (error) { handleApiError(error) }
})
