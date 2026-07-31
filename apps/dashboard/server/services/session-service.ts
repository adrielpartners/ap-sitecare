import { randomUUID } from 'node:crypto'
import type { AccessIdentity, AuthSession, Membership } from '../auth/types'
import { createOpaqueToken, hashToken } from '../auth/tokens'
import { IdentityRepository } from '../repositories/identity-repository'

export interface CreatedSession {
  session: AuthSession
  sessionToken: string
  csrfToken: string
}

export class SessionService {
  constructor(
    private readonly repository = new IdentityRepository(),
    private readonly sessionDays = 30
  ) {}

  async create(userId: string, ipHash: string | null, userAgent: string | null): Promise<CreatedSession> {
    const now = new Date()
    const sessionToken = createOpaqueToken()
    const csrfToken = createOpaqueToken()
    const session: AuthSession = {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      ipHash,
      userAgent,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionDays * 86_400_000).toISOString(),
      revokedAt: null,
      revokedBy: null
    }
    await this.repository.createSession(session)
    return { session, sessionToken, csrfToken }
  }

  async resolve(sessionToken: string): Promise<AccessIdentity | null> {
    const now = new Date()
    const session = await this.repository.findActiveSessionByTokenHash(hashToken(sessionToken), now.toISOString())
    if (!session) return null
    const user = await this.repository.findUserById(session.userId)
    if (!user || user.status !== 'active') return null
    const memberships = await this.repository.listMembershipsForUser(user.id)
    if (memberships.length === 0) return null

    const primary = selectPrimaryMembership(memberships)
    const accessibleSiteIds = await this.resolveSiteScope(primary, memberships)
    const idleMilliseconds = now.getTime() - new Date(session.lastSeenAt).getTime()
    if (idleMilliseconds >= 24 * 60 * 60 * 1000) {
      const expiresAt = new Date(now.getTime() + this.sessionDays * 86_400_000).toISOString()
      await this.repository.touchSession(session.id, now.toISOString(), expiresAt)
      session.lastSeenAt = now.toISOString()
      session.expiresAt = expiresAt
    }

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: primary.role,
      membershipIds: memberships.map(item => item.id),
      clientAccountIds: memberships.flatMap(item => item.clientAccountId ? [item.clientAccountId] : []),
      accessibleSiteIds,
      mfaRequired: user.mfaRequired,
      mfaEnrolled: Boolean(user.mfaEnrolledAt),
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt
    }
  }

  async renew(sessionId: string): Promise<string> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.sessionDays * 86_400_000).toISOString()
    await this.repository.touchSession(sessionId, now.toISOString(), expiresAt)
    return expiresAt
  }

  async revoke(sessionId: string, revokedBy: string): Promise<boolean> {
    return this.repository.revokeSession(sessionId, new Date().toISOString(), revokedBy)
  }

  private async resolveSiteScope(primary: Membership, memberships: Membership[]): Promise<string[] | null> {
    if (primary.role === 'admin') return null
    if (primary.role === 'team-member') {
      if (primary.allSites) return null
      return this.repository.listMembershipSiteIds(memberships.map(item => item.id))
    }
    return this.repository.listClientSiteIds(
      memberships.flatMap(item => item.clientAccountId ? [item.clientAccountId] : [])
    )
  }
}

function selectPrimaryMembership(memberships: Membership[]): Membership {
  return [...memberships].sort((left, right) => roleWeight(right.role) - roleWeight(left.role))[0]!
}

function roleWeight(role: Membership['role']): number {
  if (role === 'admin') return 3
  if (role === 'team-member') return 2
  return 1
}
