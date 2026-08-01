import { setAuthenticationCookies, setTrustedDeviceCookie, getLoginContext } from '../../../auth/http'
import { IdentityRepository } from '../../../repositories/identity-repository'
import { getAuthenticationService } from '../../../utils/auth-services'
import { getMfaService } from '../../../utils/mfa'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.challengeToken !== 'string' || typeof body.code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Challenge token and verification code are required.' })
  }
  try {
    const mfa = getMfaService(event)
    const userId = await mfa.verifyLoginChallenge(body.challengeToken, body.code)
    const user = await new IdentityRepository().findUserById(userId)
    if (!user || user.status !== 'active') throw new Error('The account is not available.')
    const context = getLoginContext(event)
    const session = await getAuthenticationService(event).createLoginSession(user, context)
    setAuthenticationCookies(event, session)
    if (body.rememberDevice !== false) {
      const trusted = await mfa.createTrustedDevice(user.id, context.userAgent)
      setTrustedDeviceCookie(event, trusted.token, trusted.expiresAt)
    }
    setResponseHeader(event, 'cache-control', 'no-store')
    return { ok: true }
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'The verification code is invalid or has expired.' })
  }
})
