import { getLoginContext } from '../../../auth/http'
import { handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'
import { getMfaService } from '../../../utils/mfa'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    return {
      ok: true,
      data: await getMfaService(event).issueStepUpChallenge(
        identity.userId,
        identity.email,
        getLoginContext(event)
      )
    }
  } catch (error) {
    handleApiError(error)
  }
})
