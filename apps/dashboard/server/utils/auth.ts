import type { H3Event } from 'h3'
import type { AccessIdentity, Permission } from '../auth/types'
import { requirePermission as enforcePermission, requireSiteAccess as enforceSiteAccess } from '../auth/authorization'

export function requireAccessIdentity(event: H3Event): AccessIdentity {
  const identity = event.context.sitecareIdentity as AccessIdentity | undefined
  if (!identity) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication is required.'
    })
  }
  return identity
}

export function requireDashboardPermission(event: H3Event, permission: Permission): AccessIdentity {
  const identity = requireAccessIdentity(event)
  enforcePermission(identity, permission)
  return identity
}

export function requireDashboardSiteAccess(event: H3Event, siteId: string): AccessIdentity {
  const identity = requireAccessIdentity(event)
  enforceSiteAccess(identity, siteId)
  return identity
}
