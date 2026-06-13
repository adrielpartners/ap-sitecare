import { getDashboardActor } from '../../utils/api'
import { backupApiError } from '../../utils/backup-api'
import { getBackupDestinationService } from '../../utils/backup-destinations'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: getBackupDestinationService(event).save(parseDestination(body), getDashboardActor(event))
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})

export function parseDestination(body: Record<string, unknown>) {
  if (typeof body.name !== 'string' || typeof body.provider !== 'string') throw new Error('Destination name and provider are required.')
  if (typeof body.enabled !== 'boolean' || typeof body.inMasterPool !== 'boolean') throw new Error('Destination status values must be true or false.')
  if (!body.configuration || typeof body.configuration !== 'object' || Array.isArray(body.configuration)) throw new Error('Destination configuration is required.')
  if (body.credential !== undefined && body.credential !== null && typeof body.credential !== 'string') throw new Error('Destination credential must be a string.')
  return {
    name: body.name,
    provider: body.provider as 'dropbox' | 'google-drive' | 's3-compatible',
    enabled: body.enabled,
    inMasterPool: body.inMasterPool,
    configuration: body.configuration as Record<string, unknown>,
    credential: body.credential as string | null | undefined
  }
}
