import { MfaService } from '../../../services/mfa-service'
import { handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const service = new MfaService(getRuntimeSettings(event).credentialEncryptionKey)
    return { ok: true, data: await service.beginEnrollment(identity.userId, identity.email) }
  } catch (error) {
    handleApiError(error)
  }
})
