import { BackupRepository } from '../../../../repositories/backup-repository'

export default defineEventHandler((event) => {
  return { ok: true, data: new BackupRepository().listRestorePlans(getRouterParam(event, 'id') ?? '') }
})
