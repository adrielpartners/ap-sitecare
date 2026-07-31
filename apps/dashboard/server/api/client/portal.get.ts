import { SiteService } from '../../services/site-service'
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
      sites: (await new SiteService().list(identity.accessibleSiteIds)).map(site => ({
        id: site.id,
        name: site.name,
        url: site.url,
        status: site.status
      }))
    }
  }
})
