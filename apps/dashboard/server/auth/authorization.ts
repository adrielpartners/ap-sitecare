import { createError } from 'h3'
import type { AccessIdentity, Permission } from './types'

const rolePermissions: Record<AccessIdentity['role'], ReadonlySet<Permission>> = {
  admin: new Set([
    'operations:read',
    'operations:write',
    'audit:read',
    'action:review',
    'credentials:manage',
    'destinations:manage',
    'identity:manage',
    'portal:read'
  ]),
  'team-member': new Set([
    'operations:read',
    'operations:write',
    'audit:read',
    'action:review'
  ]),
  client: new Set(['portal:read'])
}

export function hasPermission(identity: AccessIdentity, permission: Permission): boolean {
  return rolePermissions[identity.role].has(permission)
}

export function requirePermission(identity: AccessIdentity, permission: Permission): void {
  if (!hasPermission(identity, permission)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to perform this action.' })
  }
}

export function canAccessSite(identity: AccessIdentity, siteId: string): boolean {
  return identity.accessibleSiteIds === null || identity.accessibleSiteIds.includes(siteId)
}

export function requireSiteAccess(identity: AccessIdentity, siteId: string): void {
  if (!canAccessSite(identity, siteId)) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found.' })
  }
}
