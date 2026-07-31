import { requireAccessIdentity } from '../utils/auth'

export default defineEventHandler((event) => {
  const identity = requireAccessIdentity(event)
  setResponseHeader(event, 'cache-control', 'no-store')

  return {
    ok: true,
    user: {
      id: identity.userId,
      email: identity.email,
      displayName: identity.displayName,
      role: identity.role,
      mfaRequired: identity.mfaRequired,
      mfaEnrolled: identity.mfaEnrolled
    },
    session: {
      id: identity.sessionId,
      expiresAt: identity.sessionExpiresAt
    }
  }
})
