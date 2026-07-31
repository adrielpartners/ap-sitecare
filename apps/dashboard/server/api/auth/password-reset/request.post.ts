import { getAuthenticationService } from '../../../utils/auth-services'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body.email === 'string') {
    await getAuthenticationService(event).requestPasswordReset(body.email)
  }
  return {
    ok: true,
    message: 'If an active account matches that email, a reset link has been queued.'
  }
})
