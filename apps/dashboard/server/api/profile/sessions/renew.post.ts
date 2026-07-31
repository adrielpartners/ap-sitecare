import { SessionService } from '../../../services/session-service'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  const expiresAt = await new SessionService().renew(identity.sessionId)
  return { ok: true, expiresAt }
})
