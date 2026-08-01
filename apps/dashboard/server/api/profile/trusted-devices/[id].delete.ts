import { handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'
import { getMfaService } from '../../../utils/mfa'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw new Error('Trusted device ID is required.')
    const revoked = await getMfaService(event).revokeTrustedDevice(identity.userId, id, identity.userId)
    if (!revoked) throw new Error('Trusted device not found.')
    return { ok: true }
  } catch (error) {
    handleApiError(error)
  }
})
