import { getLoginContext, setAuthenticationCookies } from '../../auth/http'
import { getAuthenticationService } from '../../utils/auth-services'
import { IdentityRepository } from '../../repositories/identity-repository'
import { MfaService } from '../../services/mfa-service'
import { SessionService } from '../../services/session-service'
import { getRuntimeSettings } from '../../utils/config'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }
  const session = await getAuthenticationService(event).login(body.email, body.password, getLoginContext(event))
  const repository = new IdentityRepository()
  const user = await repository.findUserById(session.session.userId)
  if (user?.mfaRequired && user.mfaEnrolledAt) {
    try {
      if (typeof body.mfaCode !== 'string' || !body.mfaCode.trim()) throw new Error('Authenticator code is required.')
      await new MfaService(getRuntimeSettings(event).credentialEncryptionKey).verifyStepUp(user.id, body.mfaCode)
    } catch {
      await new SessionService(repository).revoke(session.session.id, 'system:mfa-login-gate')
      throw createError({ statusCode: 401, statusMessage: 'The email, password, or authenticator code is incorrect.' })
    }
  }
  setAuthenticationCookies(event, session)
  setResponseHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
