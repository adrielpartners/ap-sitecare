import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { ApplicationUser, AuthenticationEventType, Invitation, Membership, MembershipRole } from '../auth/types'
import type { PasswordHasher } from '../auth/password'
import { ScryptPasswordHasher } from '../auth/password'
import { createOpaqueToken, hashToken } from '../auth/tokens'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { IdentityRepository } from '../repositories/identity-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { EmailOutboxService } from './email-outbox-service'
import { SessionService, type CreatedSession } from './session-service'

const genericLoginError = 'The email or password is incorrect.'

export interface LoginContext {
  ipHash: string | null
  userAgent: string | null
}

export interface InvitationInput {
  email: string
  displayName?: string | null
  role: MembershipRole
  clientAccountId?: string | null
  allSites?: boolean
  siteIds?: string[]
  invitedBy: string
}

export class AuthenticationService {
  constructor(
    private readonly database: TransactionalQueryExecutor = useDatabase(),
    private readonly passwordHasher: PasswordHasher = new ScryptPasswordHasher(),
    private readonly outbox?: {
      enqueue(messageType: string, idempotencyKey: string, message: { recipientEmail: string, subject: string, textContent: string, htmlContent: string }): Promise<unknown>
    },
    private readonly appBaseUrl = 'http://localhost:3000'
  ) {}

  async bootstrapAdministrator(email: string, displayName: string, password: string): Promise<ApplicationUser> {
    const passwordHash = await this.passwordHasher.hash(password)
    const now = new Date().toISOString()
    const user: ApplicationUser = {
      id: randomUUID(),
      email: normalizeEmail(email),
      displayName: requiredDisplayName(displayName),
      status: 'active',
      mfaRequired: true,
      mfaEnrolledAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      disabledAt: null
    }
    await this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      if (await repository.countAdministrators() > 0) {
        throw new Error('An administrator already exists.')
      }
      await repository.createUser(user, passwordHash)
      await repository.createMembership({
        id: randomUUID(),
        userId: user.id,
        role: 'admin',
        clientAccountId: null,
        allSites: true,
        createdAt: now,
        updatedAt: now
      })
      await repository.recordAuthenticationEvent({
        id: randomUUID(),
        userId: user.id,
        email: user.email,
        eventType: 'admin.bootstrapped',
        ipHash: null,
        userAgent: 'sitecare-bootstrap-cli',
        createdAt: now
      })
    })
    return user
  }

  async login(email: string, password: string, context: LoginContext): Promise<CreatedSession> {
    const normalizedEmail = normalizeEmail(email)
    const repository = new IdentityRepository(this.database)
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const failures = await repository.countRecentLoginFailures(normalizedEmail, context.ipHash, since)
    if (failures >= 5) {
      await this.recordEvent('login.rate-limited', null, normalizedEmail, context)
      throw authError(429, 'Too many sign-in attempts. Please wait and try again.')
    }

    const user = await repository.findUserWithPasswordByEmail(normalizedEmail)
    const valid = user?.passwordHash
      ? await this.passwordHasher.verify(password, user.passwordHash)
      : await this.passwordHasher.verify(password, 'invalid')
    if (!user || !valid || user.status !== 'active') {
      await this.recordEvent('login.failed', user?.id ?? null, normalizedEmail, context)
      throw authError(401, genericLoginError)
    }

    const now = new Date().toISOString()
    await repository.updateUser({ ...user, lastLoginAt: now, updatedAt: now })
    const session = await new SessionService(repository).create(user.id, context.ipHash, context.userAgent)
    await this.recordEvent('login.succeeded', user.id, normalizedEmail, context, {
      sessionId: session.session.id
    })
    return session
  }

  async createInvitation(input: InvitationInput): Promise<{ invitation: Invitation, token: string }> {
    validateMembership(input.role, input.clientAccountId ?? null, input.allSites ?? false)
    const token = createOpaqueToken()
    const now = new Date()
    const invitationId = randomUUID()
    return this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      if (await repository.findUserWithPasswordByEmail(input.email)) {
        throw new Error('A user with that email already exists.')
      }
      const invitation = await repository.createInvitation({
        id: invitationId,
        email: normalizeEmail(input.email),
        displayName: input.displayName?.trim() || null,
        role: input.role,
        clientAccountId: input.clientAccountId ?? null,
        allSites: input.role === 'admin' ? true : (input.allSites ?? false),
        tokenHash: hashToken(token),
        invitedBy: input.invitedBy,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
        acceptedAt: null,
        revokedAt: null
      })
      if (input.role === 'team-member' && !input.allSites) {
        await repository.replaceInvitationSiteAccess(invitationId, input.siteIds ?? [], now.toISOString())
      }
      const url = `${this.appBaseUrl.replace(/\/$/, '')}/invitation?token=${encodeURIComponent(token)}`
      await this.outboxFor(executor).enqueue('account-invitation', `invitation:${invitationId}`, {
        recipientEmail: invitation.email,
        subject: 'Your SiteCare Dashboard invitation',
        textContent: `You have been invited to SiteCare. Accept your invitation: ${url}`,
        htmlContent: `<p>You have been invited to SiteCare.</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p>`
      })
      await repository.recordAuthenticationEvent({
        id: randomUUID(),
        userId: null,
        email: invitation.email,
        eventType: 'invitation.created',
        ipHash: null,
        userAgent: null,
        metadata: { invitedBy: input.invitedBy, role: input.role },
        createdAt: now.toISOString()
      })
      return { invitation, token }
    })
  }

  async acceptInvitation(token: string, displayName: string, password: string): Promise<ApplicationUser> {
    const passwordHash = await this.passwordHasher.hash(password)
    const tokenHash = hashToken(token)
    const now = new Date().toISOString()
    return this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      const invitation = await repository.findInvitationByTokenHash(tokenHash)
      if (
        !invitation
        || invitation.acceptedAt
        || invitation.revokedAt
        || invitation.expiresAt <= now
      ) throw authError(400, 'This invitation is invalid or has expired.')
      if (await repository.findUserWithPasswordByEmail(invitation.email)) {
        throw authError(400, 'This invitation can no longer be accepted.')
      }

      const user: ApplicationUser = {
        id: randomUUID(),
        email: invitation.email,
        displayName: requiredDisplayName(displayName || invitation.displayName || ''),
        status: 'active',
        mfaRequired: invitation.role === 'admin',
        mfaEnrolledAt: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
        disabledAt: null
      }
      await repository.createUser(user, passwordHash)
      const membership: Membership = {
        id: randomUUID(),
        userId: user.id,
        role: invitation.role,
        clientAccountId: invitation.clientAccountId,
        allSites: invitation.allSites,
        createdAt: now,
        updatedAt: now
      }
      await repository.createMembership(membership)
      if (membership.role === 'team-member' && !membership.allSites) {
        await repository.replaceMembershipSiteAccess(
          membership.id,
          await repository.listInvitationSiteIds(invitation.id),
          now
        )
      }
      await repository.acceptInvitation(invitation.id, now)
      await repository.recordAuthenticationEvent({
        id: randomUUID(),
        userId: user.id,
        email: user.email,
        eventType: 'invitation.accepted',
        ipHash: null,
        userAgent: null,
        createdAt: now
      })
      return user
    })
  }

  async requestPasswordReset(email: string): Promise<void> {
    const now = new Date()
    const token = createOpaqueToken()
    const resetId = randomUUID()
    await this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      const user = await repository.findUserWithPasswordByEmail(normalizeEmail(email))
      if (!user || user.status !== 'active') return
      await repository.createPasswordReset({
        id: resetId,
        userId: user.id,
        tokenHash: hashToken(token),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
        usedAt: null
      })
      const url = `${this.appBaseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`
      await this.outboxFor(executor).enqueue('password-reset', `password-reset:${resetId}`, {
        recipientEmail: user.email,
        subject: 'Reset your SiteCare password',
        textContent: `Reset your SiteCare password: ${url}`,
        htmlContent: `<p>A password reset was requested for your SiteCare account.</p><p><a href="${escapeHtml(url)}">Reset password</a></p>`
      })
      await repository.recordAuthenticationEvent({
        id: randomUUID(),
        userId: user.id,
        email: user.email,
        eventType: 'password-reset.requested',
        ipHash: null,
        userAgent: null,
        createdAt: now.toISOString()
      })
    })
  }

  async completePasswordReset(token: string, password: string): Promise<void> {
    const passwordHash = await this.passwordHasher.hash(password)
    const now = new Date().toISOString()
    await this.database.transaction(async executor => {
      const repository = new IdentityRepository(executor)
      const reset = await repository.findPasswordResetByTokenHash(hashToken(token))
      if (!reset || reset.usedAt || reset.expiresAt <= now) {
        throw authError(400, 'This password reset link is invalid or has expired.')
      }
      await repository.updatePassword(reset.userId, passwordHash, now)
      await repository.usePasswordReset(reset.id, now)
      await repository.revokeUserSessions(reset.userId, now, 'password-reset')
      const user = await repository.findUserById(reset.userId)
      await repository.recordAuthenticationEvent({
        id: randomUUID(),
        userId: reset.userId,
        email: user?.email ?? null,
        eventType: 'password-reset.completed',
        ipHash: null,
        userAgent: null,
        createdAt: now
      })
    })
  }

  private async recordEvent(
    eventType: AuthenticationEventType,
    userId: string | null,
    email: string | null,
    context: LoginContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await new IdentityRepository(this.database).recordAuthenticationEvent({
      id: randomUUID(),
      userId,
      email,
      eventType,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      metadata,
      createdAt: new Date().toISOString()
    })
  }

  private outboxFor(executor: QueryExecutor): {
    enqueue(messageType: string, idempotencyKey: string, message: { recipientEmail: string, subject: string, textContent: string, htmlContent: string }): Promise<unknown>
  } {
    return this.outbox ?? new EmailOutboxService(new EmailOutboxRepository(executor))
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('A valid email address is required.')
  return normalized
}

function requiredDisplayName(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('Display name is required.')
  return normalized
}

function validateMembership(role: MembershipRole, clientAccountId: string | null, allSites: boolean): void {
  if (role === 'client' && (!clientAccountId || allSites)) {
    throw new Error('Client users must belong to one client account.')
  }
  if (role !== 'client' && clientAccountId) {
    throw new Error('Staff users cannot belong to a client account.')
  }
}

function authError(statusCode: number, statusMessage: string): Error {
  return createError({ statusCode, statusMessage })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
