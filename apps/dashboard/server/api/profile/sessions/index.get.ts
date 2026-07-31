import { IdentityRepository } from '../../../repositories/identity-repository'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  const sessions = await new IdentityRepository().listActiveSessions(identity.userId, new Date().toISOString())
  return {
    ok: true,
    data: sessions.map(session => ({
      id: session.id,
      current: session.id === identity.sessionId,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt
    }))
  }
})
