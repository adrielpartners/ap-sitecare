import { MfaService } from '../../../services/mfa-service'
import { handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.code !== 'string') throw new Error('Verification code is required.')
    const service = new MfaService(getRuntimeSettings(event).credentialEncryptionKey)
    return { ok: true, data: await service.completeEnrollment(identity.userId, body.code) }
  } catch (error) {
    handleApiError(error)
  }
})
