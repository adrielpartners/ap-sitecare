import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const proposalId = getRouterParam(event, 'proposalId')
    if (!proposalId) throw createError({ statusCode: 400, statusMessage: 'Cleanup proposal ID is required.' })
    requireDashboardPermission(event, 'operations:write')
    const body = await readBody<Record<string, unknown>>(event)
    const service = new SiteHealthService()
    const current = await service.getCleanupProposal(proposalId)
    requireDashboardSiteAccess(event, current.siteId)
    const proposal = await service.initiateCleanupProposal(
      proposalId,
      typeof body.notes === 'string' ? body.notes : null,
      getDashboardActor(event)
    )
    return { ok: true, data: proposal }
  } catch (error) {
    handleApiError(error)
  }
})
