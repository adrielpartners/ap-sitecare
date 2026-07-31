import { BackupRepository } from '../../../../repositories/backup-repository'

export default defineEventHandler(async (event) => {
  return { ok: true, data: await new BackupRepository().listRestorePlans(getRouterParam(event, 'id') ?? '') }
})
