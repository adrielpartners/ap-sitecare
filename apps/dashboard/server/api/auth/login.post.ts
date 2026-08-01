import { getCookie } from 'h3'
import { getLoginContext, setAuthenticationCookies, TRUSTED_DEVICE_COOKIE } from '../../auth/http'
import { getAuthenticationService } from '../../utils/auth-services'
import { getMfaService } from '../../utils/mfa'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }
  const context = getLoginContext(event)
  const authentication = getAuthenticationService(event)
  const user = await authentication.verifyCredentials(body.email, body.password, context)
  const mfa = getMfaService(event)
  if (user.mfaRequired && user.mfaEnrolledAt) {
    const trusted = await mfa.verifyTrustedDevice(user.id, getCookie(event, TRUSTED_DEVICE_COOKIE))
    if (!trusted) {
      const challenge = await mfa.issueLoginChallenge(user.id, user.email, context)
      setResponseHeader(event, 'cache-control', 'no-store')
      return { ok: true, status: 'mfa-required' as const, data: challenge }
    }
  }
  const session = await authentication.createLoginSession(user, context)
  setAuthenticationCookies(event, session)
  setResponseHeader(event, 'cache-control', 'no-store')
  return { ok: true, status: 'authenticated' as const }
})
