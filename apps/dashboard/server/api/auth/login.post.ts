import { getLoginContext, setAuthenticationCookies } from '../../auth/http'
import { getAuthenticationService } from '../../utils/auth-services'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }
  const session = await getAuthenticationService(event).login(body.email, body.password, getLoginContext(event))
  setAuthenticationCookies(event, session)
  setResponseHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
