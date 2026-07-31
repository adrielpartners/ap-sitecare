import type { MembershipRole } from '../../../auth/types'
import { IdentityAdminService } from '../../../services/identity-admin-service'
import { requireAccessIdentity } from '../../../utils/auth'
import { getAuthenticationService } from '../../../utils/auth-services'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  const body = await readBody<Record<string, unknown>>(event)
  const role = body.role as MembershipRole
  if (typeof body.email !== 'string' || !['admin', 'team-member', 'client'].includes(role)) {
    throw createError({ statusCode: 400, statusMessage: 'Email and a valid role are required.' })
  }
  const service = new IdentityAdminService(undefined, getAuthenticationService(event))
  const invitation = await service.invite({
    email: body.email,
    displayName: typeof body.displayName === 'string' ? body.displayName : null,
    role,
    clientAccountId: typeof body.clientAccountId === 'string' ? body.clientAccountId : null,
    allSites: Boolean(body.allSites),
    siteIds: Array.isArray(body.siteIds) ? body.siteIds.filter((item): item is string => typeof item === 'string') : [],
    invitedBy: identity.userId
  })
  return { ok: true, data: invitation }
})
