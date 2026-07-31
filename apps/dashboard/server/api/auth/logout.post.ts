import { randomUUID } from 'node:crypto'
import { clearAuthenticationCookies } from '../../auth/http'
import { IdentityRepository } from '../../repositories/identity-repository'
import { SessionService } from '../../services/session-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  await new SessionService().revoke(identity.sessionId, identity.userId)
  await new IdentityRepository().recordAuthenticationEvent({
    id: randomUUID(),
    userId: identity.userId,
    email: identity.email,
    eventType: 'logout',
    ipHash: null,
    userAgent: getHeader(event, 'user-agent') ?? null,
    metadata: { sessionId: identity.sessionId },
    createdAt: new Date().toISOString()
  })
  clearAuthenticationCookies(event)
  return { ok: true }
})
