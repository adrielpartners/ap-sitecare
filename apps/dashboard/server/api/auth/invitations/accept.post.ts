import { getAuthenticationService } from '../../../utils/auth-services'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.token !== 'string' || typeof body.displayName !== 'string' || typeof body.password !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Token, display name, and password are required.' })
  }
  await getAuthenticationService(event).acceptInvitation(body.token, body.displayName, body.password)
  return { ok: true }
})
