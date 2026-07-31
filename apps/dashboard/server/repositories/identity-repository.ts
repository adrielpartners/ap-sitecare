import type {
  ApplicationUser,
  AuthenticationEventType,
  AuthSession,
  ClientAccount,
  Invitation,
  Membership,
  MembershipRole
} from '../auth/types'
import { useDatabase, type QueryExecutor } from '../utils/database'

interface UserRow {
  id: string
  email: string
  display_name: string
  status: ApplicationUser['status']
  mfa_required: boolean
  mfa_enrolled_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
  disabled_at: string | null
}

interface MembershipRow {
  id: string
  user_id: string
  role: MembershipRole
  client_account_id: string | null
  all_sites: boolean
  created_at: string
  updated_at: string
}

interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  csrf_token_hash: string
  ip_hash: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
  revoked_by: string | null
}

interface InvitationRow {
  id: string
  email: string
  display_name: string | null
  role: MembershipRole
  client_account_id: string | null
  all_sites: boolean
  token_hash: string
  invited_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

interface ClientAccountRow {
  id: string
  name: string
  status: ClientAccount['status']
  is_placeholder: boolean
  created_at: string
  updated_at: string
}

export interface UserWithPassword extends ApplicationUser {
  passwordHash: string | null
}

export interface StoredInvitation extends Invitation {
  tokenHash: string
}

export interface StoredPasswordReset {
  id: string
  userId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
}

export interface AuthenticationEventInput {
  id: string
  userId: string | null
  email: string | null
  eventType: AuthenticationEventType
  ipHash: string | null
  userAgent: string | null
  metadata?: Record<string, unknown>
  createdAt: string
}

function mapUser(row: UserRow): ApplicationUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    mfaRequired: row.mfa_required,
    mfaEnrolledAt: row.mfa_enrolled_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at
  }
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    clientAccountId: row.client_account_id,
    allSites: row.all_sites,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapSession(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    ipHash: row.ip_hash,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by
  }
}

function mapInvitation(row: InvitationRow): StoredInvitation {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    clientAccountId: row.client_account_id,
    allSites: row.all_sites,
    tokenHash: row.token_hash,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at
  }
}

function mapClient(row: ClientAccountRow): ClientAccount {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    isPlaceholder: row.is_placeholder,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class IdentityRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async countAdministrators(): Promise<number> {
    const result = await this.database.query<{ count: string }>(`
      SELECT COUNT(DISTINCT u.id)::text AS count
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      WHERE m.role = 'admin'
    `)
    return Number(result.rows[0]?.count ?? 0)
  }

  async createUser(user: ApplicationUser, passwordHash: string): Promise<ApplicationUser> {
    await this.database.query(`
      INSERT INTO users (
        id, email, display_name, status, mfa_required, mfa_enrolled_at,
        last_login_at, created_at, updated_at, disabled_at
      ) VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      user.id, user.email, user.displayName, user.status, user.mfaRequired,
      user.mfaEnrolledAt, user.lastLoginAt, user.createdAt, user.updatedAt,
      user.disabledAt
    ])
    await this.database.query(`
      INSERT INTO user_password_credentials (
        user_id, password_hash, password_changed_at, created_at
      ) VALUES ($1, $2, $3, $3)
    `, [user.id, passwordHash, user.createdAt])
    return user
  }

  async findUserById(id: string): Promise<ApplicationUser | null> {
    const result = await this.database.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async findUserWithPasswordByEmail(email: string): Promise<UserWithPassword | null> {
    const result = await this.database.query<UserRow & { password_hash: string | null }>(`
      SELECT u.*, c.password_hash
      FROM users u
      LEFT JOIN user_password_credentials c ON c.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
    `, [email])
    const row = result.rows[0]
    return row ? { ...mapUser(row), passwordHash: row.password_hash } : null
  }

  async listUsers(): Promise<Array<ApplicationUser & { memberships: Array<Membership & { siteIds: string[] }> }>> {
    const users = await this.database.query<UserRow>('SELECT * FROM users ORDER BY display_name, email')
    const memberships = await this.database.query<MembershipRow>('SELECT * FROM memberships ORDER BY created_at')
    const access = await this.database.query<{ membership_id: string, site_id: string }>(
      'SELECT membership_id, site_id FROM membership_site_access ORDER BY site_id'
    )
    return users.rows.map(row => ({
      ...mapUser(row),
      memberships: memberships.rows.filter(item => item.user_id === row.id).map(item => ({
        ...mapMembership(item),
        siteIds: access.rows.filter(entry => entry.membership_id === item.id).map(entry => entry.site_id)
      }))
    }))
  }

  async updateUser(user: ApplicationUser): Promise<ApplicationUser> {
    await this.database.query(`
      UPDATE users
      SET email = LOWER($2), display_name = $3, status = $4, mfa_required = $5,
          mfa_enrolled_at = $6, last_login_at = $7, updated_at = $8, disabled_at = $9
      WHERE id = $1
    `, [
      user.id, user.email, user.displayName, user.status, user.mfaRequired,
      user.mfaEnrolledAt, user.lastLoginAt, user.updatedAt, user.disabledAt
    ])
    return user
  }

  async updatePassword(userId: string, passwordHash: string, changedAt: string): Promise<void> {
    await this.database.query(`
      INSERT INTO user_password_credentials (
        user_id, password_hash, password_changed_at, created_at
      ) VALUES ($1, $2, $3, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          password_changed_at = EXCLUDED.password_changed_at
    `, [userId, passwordHash, changedAt])
  }

  async createMembership(membership: Membership): Promise<Membership> {
    await this.database.query(`
      INSERT INTO memberships (
        id, user_id, role, client_account_id, all_sites, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      membership.id, membership.userId, membership.role,
      membership.clientAccountId, membership.allSites,
      membership.createdAt, membership.updatedAt
    ])
    return membership
  }

  async listMembershipsForUser(userId: string): Promise<Membership[]> {
    const result = await this.database.query<MembershipRow>(
      'SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at',
      [userId]
    )
    return result.rows.map(mapMembership)
  }

  async updateMembership(membership: Membership): Promise<Membership> {
    await this.database.query(`
      UPDATE memberships
      SET role = $2, client_account_id = $3, all_sites = $4, updated_at = $5
      WHERE id = $1
    `, [
      membership.id, membership.role, membership.clientAccountId,
      membership.allSites, membership.updatedAt
    ])
    return membership
  }

  async replaceMembershipSiteAccess(membershipId: string, siteIds: string[], createdAt: string): Promise<void> {
    await this.database.query('DELETE FROM membership_site_access WHERE membership_id = $1', [membershipId])
    for (const siteId of [...new Set(siteIds)]) {
      await this.database.query(`
        INSERT INTO membership_site_access (membership_id, site_id, created_at)
        VALUES ($1, $2, $3)
      `, [membershipId, siteId, createdAt])
    }
  }

  async listMembershipSiteIds(membershipIds: string[]): Promise<string[]> {
    if (membershipIds.length === 0) return []
    const result = await this.database.query<{ site_id: string }>(`
      SELECT DISTINCT site_id
      FROM membership_site_access
      WHERE membership_id = ANY($1::text[])
    `, [membershipIds])
    return result.rows.map(row => row.site_id)
  }

  async listClientSiteIds(clientAccountIds: string[]): Promise<string[]> {
    if (clientAccountIds.length === 0) return []
    const result = await this.database.query<{ site_id: string }>(`
      SELECT DISTINCT site_id
      FROM site_client_accounts sca
      JOIN client_accounts ca ON ca.id = sca.client_account_id
      WHERE sca.client_account_id = ANY($1::text[])
        AND ca.status = 'active'
    `, [clientAccountIds])
    return result.rows.map(row => row.site_id)
  }

  async createSession(session: AuthSession): Promise<AuthSession> {
    await this.database.query(`
      INSERT INTO auth_sessions (
        id, user_id, token_hash, csrf_token_hash, ip_hash, user_agent,
        created_at, last_seen_at, expires_at, revoked_at, revoked_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      session.id, session.userId, session.tokenHash, session.csrfTokenHash,
      session.ipHash, session.userAgent, session.createdAt, session.lastSeenAt,
      session.expiresAt, session.revokedAt, session.revokedBy
    ])
    return session
  }

  async findActiveSessionByTokenHash(tokenHash: string, now: string): Promise<AuthSession | null> {
    const result = await this.database.query<SessionRow>(`
      SELECT *
      FROM auth_sessions
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
    `, [tokenHash, now])
    return result.rows[0] ? mapSession(result.rows[0]) : null
  }

  async listActiveSessions(userId: string, now: string): Promise<AuthSession[]> {
    const result = await this.database.query<SessionRow>(`
      SELECT *
      FROM auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
      ORDER BY last_seen_at DESC
    `, [userId, now])
    return result.rows.map(mapSession)
  }

  async touchSession(id: string, lastSeenAt: string, expiresAt: string): Promise<void> {
    await this.database.query(`
      UPDATE auth_sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1
    `, [id, lastSeenAt, expiresAt])
  }

  async revokeSession(id: string, revokedAt: string, revokedBy: string): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE auth_sessions
      SET revoked_at = $2, revoked_by = $3
      WHERE id = $1 AND revoked_at IS NULL
    `, [id, revokedAt, revokedBy])
    return (result.rowCount ?? 0) > 0
  }

  async revokeUserSessions(userId: string, revokedAt: string, revokedBy: string): Promise<void> {
    await this.database.query(`
      UPDATE auth_sessions
      SET revoked_at = $2, revoked_by = $3
      WHERE user_id = $1 AND revoked_at IS NULL
    `, [userId, revokedAt, revokedBy])
  }

  async createInvitation(invitation: StoredInvitation): Promise<Invitation> {
    await this.database.query(`
      INSERT INTO invitations (
        id, email, display_name, role, client_account_id, all_sites, token_hash,
        invited_by, created_at, expires_at, accepted_at, revoked_at
      ) VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      invitation.id, invitation.email, invitation.displayName, invitation.role,
      invitation.clientAccountId, invitation.allSites, invitation.tokenHash,
      invitation.invitedBy, invitation.createdAt, invitation.expiresAt,
      invitation.acceptedAt, invitation.revokedAt
    ])
    const { tokenHash: _tokenHash, ...safeInvitation } = invitation
    return safeInvitation
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<StoredInvitation | null> {
    const result = await this.database.query<InvitationRow>(
      'SELECT * FROM invitations WHERE token_hash = $1',
      [tokenHash]
    )
    return result.rows[0] ? mapInvitation(result.rows[0]) : null
  }

  async replaceInvitationSiteAccess(invitationId: string, siteIds: string[], createdAt: string): Promise<void> {
    await this.database.query('DELETE FROM invitation_site_access WHERE invitation_id = $1', [invitationId])
    for (const siteId of [...new Set(siteIds)]) {
      await this.database.query(`
        INSERT INTO invitation_site_access (invitation_id, site_id, created_at)
        VALUES ($1, $2, $3)
      `, [invitationId, siteId, createdAt])
    }
  }

  async listInvitationSiteIds(invitationId: string): Promise<string[]> {
    const result = await this.database.query<{ site_id: string }>(`
      SELECT site_id FROM invitation_site_access WHERE invitation_id = $1
    `, [invitationId])
    return result.rows.map(row => row.site_id)
  }

  async listInvitations(): Promise<Invitation[]> {
    const result = await this.database.query<InvitationRow>('SELECT * FROM invitations ORDER BY created_at DESC')
    return result.rows.map(row => {
      const { tokenHash: _tokenHash, ...invitation } = mapInvitation(row)
      return invitation
    })
  }

  async acceptInvitation(id: string, acceptedAt: string): Promise<void> {
    await this.database.query(`
      UPDATE invitations SET accepted_at = $2 WHERE id = $1 AND accepted_at IS NULL
    `, [id, acceptedAt])
  }

  async createPasswordReset(reset: StoredPasswordReset): Promise<void> {
    await this.database.query(`
      INSERT INTO password_resets (
        id, user_id, token_hash, created_at, expires_at, used_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [reset.id, reset.userId, reset.tokenHash, reset.createdAt, reset.expiresAt, reset.usedAt])
  }

  async findPasswordResetByTokenHash(tokenHash: string): Promise<StoredPasswordReset | null> {
    const result = await this.database.query<{
      id: string
      user_id: string
      token_hash: string
      created_at: string
      expires_at: string
      used_at: string | null
    }>('SELECT * FROM password_resets WHERE token_hash = $1', [tokenHash])
    const row = result.rows[0]
    return row ? {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at
    } : null
  }

  async usePasswordReset(id: string, usedAt: string): Promise<void> {
    await this.database.query(`
      UPDATE password_resets SET used_at = $2 WHERE id = $1 AND used_at IS NULL
    `, [id, usedAt])
  }

  async recordAuthenticationEvent(input: AuthenticationEventInput): Promise<void> {
    await this.database.query(`
      INSERT INTO authentication_events (
        id, user_id, email, event_type, ip_hash, user_agent, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `, [
      input.id, input.userId, input.email?.toLowerCase() ?? null, input.eventType,
      input.ipHash, input.userAgent, JSON.stringify(input.metadata ?? {}), input.createdAt
    ])
  }

  async countRecentLoginFailures(email: string, ipHash: string | null, since: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM authentication_events
      WHERE event_type IN ('login.failed', 'login.rate-limited')
        AND created_at >= $3
        AND (LOWER(email) = LOWER($1) OR ($2::text IS NOT NULL AND ip_hash = $2))
    `, [email, ipHash, since])
    return Number(result.rows[0]?.count ?? 0)
  }

  async createClientAccount(client: ClientAccount): Promise<ClientAccount> {
    await this.database.query(`
      INSERT INTO client_accounts (id, name, status, is_placeholder, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [client.id, client.name, client.status, client.isPlaceholder, client.createdAt, client.updatedAt])
    return client
  }

  async findClientAccount(id: string, forUpdate = false): Promise<ClientAccount | null> {
    const result = await this.database.query<ClientAccountRow>(
      `SELECT * FROM client_accounts WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    )
    return result.rows[0] ? mapClient(result.rows[0]) : null
  }

  async updateClientAccount(client: ClientAccount): Promise<ClientAccount> {
    await this.database.query(`
      UPDATE client_accounts
      SET name = $2, status = $3, is_placeholder = $4, updated_at = $5
      WHERE id = $1
    `, [client.id, client.name, client.status, client.isPlaceholder, client.updatedAt])
    return client
  }

  async listClientAccounts(): Promise<ClientAccount[]> {
    const result = await this.database.query<ClientAccountRow>('SELECT * FROM client_accounts ORDER BY name')
    return result.rows.map(mapClient)
  }

  async listClientSiteAssignments(): Promise<Array<{ siteId: string, clientAccountId: string }>> {
    const result = await this.database.query<{ site_id: string, client_account_id: string }>(`
      SELECT site_id, client_account_id FROM site_client_accounts ORDER BY site_id
    `)
    return result.rows.map(row => ({
      siteId: row.site_id,
      clientAccountId: row.client_account_id
    }))
  }

  async listClientSiteIdsDirect(clientAccountId: string): Promise<string[]> {
    const result = await this.database.query<{ site_id: string }>(`
      SELECT site_id
      FROM site_client_accounts
      WHERE client_account_id = $1
      ORDER BY site_id
    `, [clientAccountId])
    return result.rows.map(row => row.site_id)
  }

  async countClientUsers(clientAccountId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(`
      SELECT COUNT(DISTINCT user_id)::text AS count
      FROM memberships
      WHERE role = 'client' AND client_account_id = $1
    `, [clientAccountId])
    return Number(result.rows[0]?.count ?? 0)
  }

  async assignSiteToClient(siteId: string, clientAccountId: string, assignedBy: string, assignedAt: string): Promise<void> {
    await this.database.query(`
      INSERT INTO site_client_accounts (site_id, client_account_id, assigned_at, assigned_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (site_id) DO UPDATE
      SET client_account_id = EXCLUDED.client_account_id,
          assigned_at = EXCLUDED.assigned_at,
          assigned_by = EXCLUDED.assigned_by
    `, [siteId, clientAccountId, assignedAt, assignedBy])
  }
}
