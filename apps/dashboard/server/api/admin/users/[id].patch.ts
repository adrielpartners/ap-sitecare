import type { MembershipRole } from '../../../auth/types'
import { IdentityAdminService } from '../../../services/identity-admin-service'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireAccessIdentity(event)
  const body = await readBody<Record<string, unknown>>(event)
  const role = body.role as MembershipRole
  if (!['admin', 'team-member', 'client'].includes(role)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid role is required.' })
  }
  await new IdentityAdminService().updateUser(getRouterParam(event, 'id') ?? '', {
    status: body.status === 'disabled' ? 'disabled' : 'active',
    mfaRequired: Boolean(body.mfaRequired),
    role,
    allSites: Boolean(body.allSites),
    clientAccountId: typeof body.clientAccountId === 'string' ? body.clientAccountId : null,
    siteIds: Array.isArray(body.siteIds) ? body.siteIds.filter((item): item is string => typeof item === 'string') : []
  }, identity.userId)
  return { ok: true }
})
