export type UserStatus = 'active' | 'disabled'
export type ClientAccountStatus = 'active' | 'suspended'
export type MembershipRole = 'admin' | 'team-member' | 'client'

export interface ApplicationUser {
  id: string
  email: string
  displayName: string
  status: UserStatus
  mfaRequired: boolean
  mfaEnrolledAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  disabledAt: string | null
}

export interface ClientAccount {
  id: string
  name: string
  status: ClientAccountStatus
  isPlaceholder: boolean
  createdAt: string
  updatedAt: string
}

export interface Membership {
  id: string
  userId: string
  role: MembershipRole
  clientAccountId: string | null
  allSites: boolean
  createdAt: string
  updatedAt: string
}

export interface AccessIdentity {
  userId: string
  email: string
  displayName: string
  role: MembershipRole
  membershipIds: string[]
  clientAccountIds: string[]
  accessibleSiteIds: string[] | null
  mfaRequired: boolean
  mfaEnrolled: boolean
  sessionId: string
  sessionExpiresAt: string
}

export interface AuthSession {
  id: string
  userId: string
  tokenHash: string
  csrfTokenHash: string
  ipHash: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  revokedAt: string | null
  revokedBy: string | null
}

export interface Invitation {
  id: string
  email: string
  displayName: string | null
  role: MembershipRole
  clientAccountId: string | null
  allSites: boolean
  invitedBy: string
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export type AuthenticationEventType =
  | 'admin.bootstrapped'
  | 'login.succeeded'
  | 'login.failed'
  | 'login.rate-limited'
  | 'logout'
  | 'session.renewed'
  | 'session.revoked'
  | 'invitation.created'
  | 'invitation.accepted'
  | 'password-reset.requested'
  | 'password-reset.completed'
  | 'password.changed'

export type Permission =
  | 'operations:read'
  | 'operations:write'
  | 'audit:read'
  | 'action:review'
  | 'credentials:manage'
  | 'destinations:manage'
  | 'identity:manage'
  | 'portal:read'
