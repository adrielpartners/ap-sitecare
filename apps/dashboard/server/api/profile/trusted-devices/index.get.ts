import { requireAccessIdentity } from '../../../utils/auth'
import { getMfaService } from '../../../utils/mfa'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  return { ok: true, data: await getMfaService(event).listTrustedDevices(identity.userId) }
})
