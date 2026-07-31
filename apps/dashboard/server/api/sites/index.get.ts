import { SiteService } from '../../services/site-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  return { ok: true, data: await new SiteService().list(identity.accessibleSiteIds) }
})
