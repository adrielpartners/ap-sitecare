import { ClientPortalService } from '../../services/client-portal-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  return {
    ok: true,
    data: {
      user: {
        displayName: identity.displayName,
        email: identity.email
      },
      sites: await new ClientPortalService().overview(identity.accessibleSiteIds ?? [])
    }
  }
})
