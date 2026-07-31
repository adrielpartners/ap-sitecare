import { SessionService } from '../../../services/session-service'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  const id = getRouterParam(event, 'id') ?? ''
  const sessions = await new (await import('../../../repositories/identity-repository')).IdentityRepository()
    .listActiveSessions(identity.userId, new Date().toISOString())
  if (!sessions.some(session => session.id === id)) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found.' })
  }
  await new SessionService().revoke(id, identity.userId)
  return { ok: true }
})
