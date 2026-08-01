import { getLoginContext, setTrustedDeviceCookie } from '../../../auth/http'
import { handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'
import { getMfaService } from '../../../utils/mfa'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.challengeToken !== 'string' || typeof body.code !== 'string') {
      throw new Error('Challenge token and verification code are required.')
    }
    const service = getMfaService(event)
    const result = await service.completeEnrollment(identity.userId, body.challengeToken, body.code)
    if (body.rememberDevice !== false) {
      const trusted = await service.createTrustedDevice(identity.userId, getLoginContext(event).userAgent)
      setTrustedDeviceCookie(event, trusted.token, trusted.expiresAt)
    }
    return { ok: true, data: result }
  } catch (error) {
    handleApiError(error)
  }
})
