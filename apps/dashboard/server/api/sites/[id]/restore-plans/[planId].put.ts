import { getDashboardActor } from '../../../../utils/api'
import { backupApiError } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    if (!Array.isArray(body.completedChecklistKeys) || body.completedChecklistKeys.some(value => typeof value !== 'string')) {
      throw new Error('Completed restore checklist keys must be an array of strings.')
    }
    for (const key of ['technicianNotes', 'targetHostLabel', 'outcome']) {
      if (typeof body[key] !== 'string') throw new Error(`${key} is required.`)
    }
    return {
      ok: true,
      data: await getBackupService(event).recordRestoreOutcome(
        getRouterParam(event, 'id') ?? '',
        getRouterParam(event, 'planId') ?? '',
        {
          completedChecklistKeys: body.completedChecklistKeys as string[],
          technicianNotes: body.technicianNotes as string,
          targetHostLabel: body.targetHostLabel as string,
          outcome: body.outcome as string,
          restorationStartedAt: typeof body.restorationStartedAt === 'string' ? body.restorationStartedAt : null,
          restorationCompletedAt: typeof body.restorationCompletedAt === 'string' ? body.restorationCompletedAt : null
        },
        getDashboardActor(event)
      )
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
