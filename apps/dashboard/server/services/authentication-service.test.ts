import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import type { PasswordHasher } from '../auth/password'
import { hashToken, verifyCsrfToken } from '../auth/tokens'
import { canAccessSite, hasPermission } from '../auth/authorization'
import { IdentityRepository } from '../repositories/identity-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { PostgresDatabase } from '../utils/database'
import { AuthenticationService } from './authentication-service'
import { SessionService } from './session-service'

class FastPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length < 12) throw new Error('Password must be at least 12 characters.')
    return `test:${password}`
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    return encodedHash === `test:${password}`
  }
}

class CapturingOutbox {
  readonly messages: Array<{ type: string, recipient: string }> = []

  async enqueue(
    messageType: string,
    _idempotencyKey: string,
    message: { recipientEmail: string }
  ): Promise<void> {
    this.messages.push({ type: messageType, recipient: message.recipientEmail })
  }
}

let database: PostgresDatabase
let repository: IdentityRepository
let service: AuthenticationService
let outbox: CapturingOutbox

before(async () => {
  database = await createTestDatabase()
  repository = new IdentityRepository(database)
  outbox = new CapturingOutbox()
  service = new AuthenticationService(database, new FastPasswordHasher(), outbox, 'https://sitecare.example')
})

after(async () => {
  await destroyTestDatabase(database)
})

test('bootstraps exactly one administrator and creates a revocable 30-day session', async () => {
  const admin = await service.bootstrapAdministrator('OWNER@EXAMPLE.COM', 'Owner', 'correct horse battery')
  assert.equal(admin.email, 'owner@example.com')
  assert.equal(admin.mfaRequired, true)
  assert.equal(await repository.countAdministrators(), 1)
  await assert.rejects(
    service.bootstrapAdministrator('second@example.com', 'Second', 'correct horse battery'),
    /already exists/
  )

  const created = await service.login('owner@example.com', 'correct horse battery', {
    ipHash: 'ip',
    userAgent: 'test-browser'
  })
  const identity = await new SessionService(repository).resolve(created.sessionToken)
  assert.equal(identity?.role, 'admin')
  assert.equal(identity?.accessibleSiteIds, null)
  assert.equal(hasPermission(identity!, 'identity:manage'), true)
  assert.equal(verifyCsrfToken(created.csrfToken, created.csrfToken, created.session.csrfTokenHash), true)
  assert.equal(verifyCsrfToken(created.csrfToken, 'wrong', created.session.csrfTokenHash), false)

  assert.equal(await new SessionService(repository).revoke(created.session.id, admin.id), true)
  assert.equal(await new SessionService(repository).resolve(created.sessionToken), null)
})

test('invited client and restricted team sessions are isolated to assigned sites', async () => {
  const siteRepository = new SiteRepository(database)
  const now = new Date().toISOString()
  const siteA = await siteRepository.create({
    id: randomUUID(),
    name: 'Client A',
    url: 'https://a.example',
    status: 'active',
    hostingProvider: 'Hostinger',
    backupStrategy: null,
    riskLevel: 'standard',
    notes: 'internal',
    createdAt: now,
    updatedAt: now,
    disabledAt: null
  })
  const siteB = await siteRepository.create({
    id: randomUUID(),
    name: 'Client B',
    url: 'https://b.example',
    status: 'active',
    hostingProvider: 'Hostinger',
    backupStrategy: null,
    riskLevel: 'standard',
    notes: 'internal',
    createdAt: now,
    updatedAt: now,
    disabledAt: null
  })
  const clientA = await repository.createClientAccount({
    id: randomUUID(),
    name: 'Client A',
    status: 'active',
    isPlaceholder: false,
    createdAt: now,
    updatedAt: now
  })
  const clientB = await repository.createClientAccount({
    id: randomUUID(),
    name: 'Client B',
    status: 'active',
    isPlaceholder: false,
    createdAt: now,
    updatedAt: now
  })
  await repository.assignSiteToClient(siteA.id, clientA.id, 'admin', now)
  await repository.assignSiteToClient(siteB.id, clientB.id, 'admin', now)

  const clientInvite = await service.createInvitation({
    email: 'client-a@example.com',
    role: 'client',
    clientAccountId: clientA.id,
    invitedBy: 'admin'
  })
  await service.acceptInvitation(clientInvite.token, 'Client User', 'client password 123')
  const clientSession = await service.login('client-a@example.com', 'client password 123', {
    ipHash: null,
    userAgent: 'client-browser'
  })
  const clientIdentity = await new SessionService(repository).resolve(clientSession.sessionToken)
  assert.deepEqual(clientIdentity?.accessibleSiteIds, [siteA.id])
  assert.equal(canAccessSite(clientIdentity!, siteA.id), true)
  assert.equal(canAccessSite(clientIdentity!, siteB.id), false)
  assert.equal(hasPermission(clientIdentity!, 'operations:read'), false)

  const teamInvite = await service.createInvitation({
    email: 'restricted-team@example.com',
    role: 'team-member',
    allSites: false,
    siteIds: [siteB.id],
    invitedBy: 'admin'
  })
  await service.acceptInvitation(teamInvite.token, 'Restricted Team', 'team password 12345')
  const teamSession = await service.login('restricted-team@example.com', 'team password 12345', {
    ipHash: null,
    userAgent: 'team-browser'
  })
  const teamIdentity = await new SessionService(repository).resolve(teamSession.sessionToken)
  assert.deepEqual(teamIdentity?.accessibleSiteIds, [siteB.id])
  assert.equal(hasPermission(teamIdentity!, 'operations:write'), true)
  assert.equal(hasPermission(teamIdentity!, 'identity:manage'), false)

  assert.equal(outbox.messages.filter(message => message.type === 'account-invitation').length, 2)

  await repository.updateClientAccount({ ...clientA, status: 'suspended', updatedAt: new Date().toISOString() })
  const suspendedClientIdentity = await new SessionService(repository).resolve(clientSession.sessionToken)
  assert.deepEqual(suspendedClientIdentity?.accessibleSiteIds, [])
})

test('password reset revokes sessions and login throttling is persisted', async () => {
  const invitation = await service.createInvitation({
    email: 'reset@example.com',
    role: 'team-member',
    allSites: true,
    invitedBy: 'admin'
  })
  await service.acceptInvitation(invitation.token, 'Reset User', 'initial password 123')
  const loggedIn = await service.login('reset@example.com', 'initial password 123', {
    ipHash: 'reset-ip',
    userAgent: 'browser'
  })

  await service.requestPasswordReset('reset@example.com')
  const resetRows = await database.query<{ token_hash: string }>(
    'SELECT token_hash FROM password_resets WHERE user_id = $1',
    [loggedIn.session.userId]
  )
  assert.equal(resetRows.rows.length, 1)
  const rawToken = 'known-reset-token'
  await database.query(
    'UPDATE password_resets SET token_hash = $1 WHERE user_id = $2',
    [hashToken(rawToken), loggedIn.session.userId]
  )
  await service.completePasswordReset(rawToken, 'replacement password 123')
  assert.equal(await new SessionService(repository).resolve(loggedIn.sessionToken), null)
  await service.login('reset@example.com', 'replacement password 123', {
    ipHash: 'new-ip',
    userAgent: 'browser'
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      service.login('reset@example.com', 'wrong password', { ipHash: 'blocked-ip', userAgent: 'browser' }),
      /incorrect/
    )
  }
  await assert.rejects(
    service.login('reset@example.com', 'replacement password 123', {
      ipHash: 'blocked-ip',
      userAgent: 'browser'
    }),
    (error: any) => error.statusCode === 429
  )
})
