import { WordPressUpdateService } from '../../services/wordpress-update-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  return {
    ok: true,
    data: await new WordPressUpdateService().listPortfolio(identity.accessibleSiteIds)
  }
})
