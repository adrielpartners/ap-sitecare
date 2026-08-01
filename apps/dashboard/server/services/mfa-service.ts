import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createOpaqueToken, hashToken } from '../auth/tokens'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EmailOutboxService } from './email-outbox-service'

export type MfaChallengePurpose = 'enrollment' | 'login' | 'step-up'

interface FactorRow {
  id: string
  recovery_codes_json: unknown
  verified_at: string | null
}

interface ChallengeRow {
  id: string
  user_id: string
  purpose: MfaChallengePurpose
  channel: 'email' | 'sms'
  code_hash: string
  attempt_count: number
  maximum_attempts: number
  expires_at: string
  used_at: string | null
  invalidated_at: string | null
}

export interface IssuedMfaChallenge {
  challengeToken: string
  destinationHint: string
  expiresAt: string
}

export interface TrustedDeviceSummary {
  id: string
  userAgent: string | null
  createdAt: string
  lastUsedAt: string
  expiresAt: string
}

interface MfaEmailOutbox {
  enqueue(
    messageType: string,
    idempotencyKey: string,
    message: { recipientEmail: string, subject: string, textContent: string, htmlContent: string }
  ): Promise<unknown>
}

export class MfaService {
  constructor(
    private readonly hashKey: string,
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase(),
    private readonly audit = new AuditService(),
    private readonly challengeMinutes = 10,
    private readonly trustedDeviceDays = 30,
    private readonly outbox?: MfaEmailOutbox
  ) {}

  async beginEnrollment(
    userId: string,
    email: string,
    context: { ipHash: string | null, userAgent: string | null } = { ipHash: null, userAgent: null }
  ): Promise<IssuedMfaChallenge> {
    const factor = await this.activeFactor(userId)
    if (factor?.verified_at) throw new Error('Email MFA is already enrolled for this account.')
    return this.issueEmailChallenge(userId, email, 'enrollment', context)
  }

  async completeEnrollment(
    userId: string,
    challengeToken: string,
    code: string
  ): Promise<{ recoveryCodes: string[] }> {
    await this.consumeChallenge(challengeToken, code, 'enrollment', userId)
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(6).toString('hex'))
    const recoveryHashes = recoveryCodes.map(hashRecoveryCode)
    const now = new Date().toISOString()
    await this.database.query(`
      UPDATE user_mfa_factors
      SET disabled_at = $2
      WHERE user_id = $1 AND factor_type IN ('email', 'totp') AND disabled_at IS NULL
    `, [userId, now])
    await this.database.query(`
      INSERT INTO user_mfa_factors (
        id, user_id, factor_type, secret_ciphertext, destination_ciphertext,
        recovery_codes_json, created_at, verified_at, disabled_at, last_used_at
      ) VALUES ($1, $2, 'email', NULL, NULL, $3::jsonb, $4, $4, NULL, $4)
    `, [randomUUID(), userId, JSON.stringify(recoveryHashes), now])
    await this.database.query(
      'UPDATE users SET mfa_enrolled_at = $2, updated_at = $2 WHERE id = $1',
      [userId, now]
    )
    await this.audit.record({
      actorType: 'dashboard-user', actorIdentifier: userId,
      eventType: 'mfa.enrolled', metadata: { factorType: 'email' }
    })
    return { recoveryCodes }
  }

  async issueLoginChallenge(
    userId: string,
    email: string,
    context: { ipHash: string | null, userAgent: string | null }
  ): Promise<IssuedMfaChallenge> {
    await this.requireEnrolled(userId)
    return this.issueEmailChallenge(userId, email, 'login', context)
  }

  async verifyLoginChallenge(challengeToken: string, code: string): Promise<string> {
    return this.consumeChallenge(challengeToken, code, 'login')
  }

  async issueStepUpChallenge(
    userId: string,
    email: string,
    context: { ipHash: string | null, userAgent: string | null }
  ): Promise<IssuedMfaChallenge> {
    await this.requireEnrolled(userId)
    return this.issueEmailChallenge(userId, email, 'step-up', context)
  }

  async verifyStepUp(userId: string, challengeToken: string, code: string): Promise<void> {
    await this.requireEnrolled(userId)
    await this.consumeChallenge(challengeToken, code, 'step-up', userId)
  }

  async createTrustedDevice(
    userId: string,
    userAgent: string | null
  ): Promise<{ token: string, expiresAt: string }> {
    const token = createOpaqueToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.trustedDeviceDays * 86_400_000).toISOString()
    await this.database.query(`
      INSERT INTO mfa_trusted_devices (
        id, user_id, token_hash, user_agent, created_at, last_used_at,
        expires_at, revoked_at, revoked_by
      ) VALUES ($1, $2, $3, $4, $5, $5, $6, NULL, NULL)
    `, [randomUUID(), userId, hashToken(token), userAgent, now.toISOString(), expiresAt])
    await this.audit.record({
      actorType: 'dashboard-user', actorIdentifier: userId,
      eventType: 'mfa.trusted-device-created', metadata: { expiresAt }
    })
    return { token, expiresAt }
  }

  async verifyTrustedDevice(userId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false
    const now = new Date().toISOString()
    const result = await this.database.query<{ id: string }>(`
      UPDATE mfa_trusted_devices
      SET last_used_at = $3
      WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > $3
      RETURNING id
    `, [userId, hashToken(token), now])
    return Boolean(result.rows[0])
  }

  async listTrustedDevices(userId: string): Promise<TrustedDeviceSummary[]> {
    const result = await this.database.query<{
      id: string, user_agent: string | null, created_at: string, last_used_at: string, expires_at: string
    }>(`
      SELECT id, user_agent, created_at, last_used_at, expires_at
      FROM mfa_trusted_devices
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
      ORDER BY last_used_at DESC
    `, [userId, new Date().toISOString()])
    return result.rows.map(row => ({
      id: row.id,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at
    }))
  }

  async revokeTrustedDevice(userId: string, deviceId: string, revokedBy: string): Promise<boolean> {
    const now = new Date().toISOString()
    const result = await this.database.query(`
      UPDATE mfa_trusted_devices
      SET revoked_at = $3, revoked_by = $4
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
    `, [deviceId, userId, now, revokedBy])
    const revoked = (result.rowCount ?? 0) > 0
    if (revoked) await this.audit.record({
      actorType: 'dashboard-user', actorIdentifier: revokedBy,
      eventType: 'mfa.trusted-device-revoked', metadata: { deviceId }
    })
    return revoked
  }

  private async issueEmailChallenge(
    userId: string,
    email: string,
    purpose: MfaChallengePurpose,
    context: { ipHash: string | null, userAgent: string | null }
  ): Promise<IssuedMfaChallenge> {
    if (!this.hashKey) throw new Error('MFA requires NUXT_CREDENTIAL_ENCRYPTION_KEY.')
    const issued = await this.withTransaction(async executor => {
      const now = new Date()
      const recent = await executor.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count FROM mfa_challenges
        WHERE user_id = $1 AND created_at >= $2
      `, [userId, new Date(now.getTime() - 15 * 60_000).toISOString()])
      if (Number(recent.rows[0]?.count ?? 0) >= 5) {
        throw new Error('Too many verification codes were requested. Please wait and try again.')
      }
      const id = randomUUID()
      const challengeToken = createOpaqueToken()
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
      const expiresAt = new Date(now.getTime() + this.challengeMinutes * 60_000).toISOString()
      await executor.query(`
        UPDATE mfa_challenges SET invalidated_at = $3
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND invalidated_at IS NULL
      `, [userId, purpose, now.toISOString()])
      await executor.query(`
        INSERT INTO mfa_challenges (
          id, user_id, purpose, channel, challenge_token_hash, code_hash,
          attempt_count, maximum_attempts, ip_hash, user_agent, created_at,
          expires_at, used_at, invalidated_at
        ) VALUES ($1, $2, $3, 'email', $4, $5, 0, 5, $6, $7, $8, $9, NULL, NULL)
      `, [
        id, userId, purpose, hashToken(challengeToken), this.codeHash(id, code),
        context.ipHash, context.userAgent, now.toISOString(), expiresAt
      ])
      await this.outboxFor(executor).enqueue('mfa-verification-code', `mfa:${id}`, {
        recipientEmail: email,
        subject: purpose === 'enrollment' ? 'Enable email verification for SiteCare' : 'Your SiteCare verification code',
        textContent: `Your SiteCare verification code is ${code}. It expires in ${this.challengeMinutes} minutes. If you did not request this code, you can ignore this email.`,
        htmlContent: `<p>Your SiteCare verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${this.challengeMinutes} minutes. If you did not request this code, you can ignore this email.</p>`
      })
      return { challengeToken, expiresAt }
    })
    await this.audit.record({
      actorType: 'dashboard-user', actorIdentifier: userId,
      eventType: 'mfa.challenge-issued', metadata: { purpose, channel: 'email', expiresAt: issued.expiresAt }
    })
    return { challengeToken: issued.challengeToken, destinationHint: maskEmail(email), expiresAt: issued.expiresAt }
  }

  private async consumeChallenge(
    challengeToken: string,
    code: string,
    purpose: MfaChallengePurpose,
    expectedUserId?: string
  ): Promise<string> {
    const now = new Date().toISOString()
    const outcome = await this.withTransaction(async executor => {
      const result = await executor.query<ChallengeRow>(`
        SELECT * FROM mfa_challenges WHERE challenge_token_hash = $1 FOR UPDATE
      `, [hashToken(challengeToken)])
      const challenge = result.rows[0]
      const usable = challenge
        && challenge.purpose === purpose
        && (!expectedUserId || challenge.user_id === expectedUserId)
        && !challenge.used_at
        && !challenge.invalidated_at
        && challenge.expires_at > now
        && challenge.attempt_count < challenge.maximum_attempts
      const validEmailCode = Boolean(usable && /^\d{6}$/.test(code.trim())
        && safeEqual(challenge.code_hash, this.codeHash(challenge.id, code.trim())))
      const normalizedRecovery = code.trim().toLowerCase().replaceAll('-', '')
      const factor = usable ? await this.activeFactor(challenge.user_id, executor) : null
      let recoveryHashes = Array.isArray(factor?.recovery_codes_json)
        ? factor.recovery_codes_json.filter((value): value is string => typeof value === 'string')
        : []
      const recoveryHash = hashRecoveryCode(normalizedRecovery)
      const recoveryIndex = validEmailCode ? -1 : recoveryHashes.findIndex(value => safeEqual(value, recoveryHash))
      if (!usable || (!validEmailCode && recoveryIndex < 0)) {
        if (challenge && !challenge.used_at && !challenge.invalidated_at) {
          await executor.query(`
            UPDATE mfa_challenges
            SET attempt_count = attempt_count + 1,
                invalidated_at = CASE WHEN attempt_count + 1 >= maximum_attempts THEN $2 ELSE invalidated_at END
            WHERE id = $1
          `, [challenge.id, now])
        }
        return { valid: false as const, userId: challenge?.user_id ?? expectedUserId ?? null, channel: null, method: null }
      }
      const method = validEmailCode ? 'email' as const : 'recovery' as const
      if (recoveryIndex >= 0 && factor) {
        recoveryHashes = recoveryHashes.filter((_, index) => index !== recoveryIndex)
        const consumedRecovery = await executor.query(`
          UPDATE user_mfa_factors
          SET recovery_codes_json = $2::jsonb, last_used_at = $3
          WHERE id = $1 AND recovery_codes_json @> $4::jsonb
        `, [factor.id, JSON.stringify(recoveryHashes), now, JSON.stringify([recoveryHash])])
        if (consumedRecovery.rowCount !== 1) {
          return { valid: false as const, userId: challenge.user_id, channel: challenge.channel, method: null }
        }
      }
      await executor.query('UPDATE mfa_challenges SET used_at = $2 WHERE id = $1', [challenge.id, now])
      if (method === 'email') {
        await executor.query(`
          UPDATE user_mfa_factors SET last_used_at = $2
          WHERE user_id = $1 AND factor_type = 'email' AND disabled_at IS NULL
        `, [challenge.user_id, now])
      }
      return { valid: true as const, userId: challenge.user_id, channel: challenge.channel, method }
    })
    if (!outcome.valid) {
      await this.audit.record({
        actorType: 'dashboard-user', actorIdentifier: outcome.userId,
        eventType: 'mfa.challenge-failed', metadata: { purpose }
      })
      throw new Error('The verification code is invalid or has expired.')
    }
    await this.audit.record({
      actorType: 'dashboard-user', actorIdentifier: outcome.userId,
      eventType: 'mfa.challenge-succeeded', metadata: { purpose, channel: outcome.channel, method: outcome.method }
    })
    return outcome.userId
  }

  private async activeFactor(userId: string, executor: QueryExecutor = this.database): Promise<FactorRow | null> {
    const result = await executor.query<FactorRow>(`
      SELECT id, recovery_codes_json, verified_at
      FROM user_mfa_factors
      WHERE user_id = $1 AND factor_type = 'email' AND disabled_at IS NULL
      LIMIT 1
    `, [userId])
    return result.rows[0] ?? null
  }

  private async requireEnrolled(userId: string): Promise<FactorRow> {
    const factor = await this.activeFactor(userId)
    if (!factor?.verified_at) throw new Error('Enroll email MFA before continuing.')
    return factor
  }

  private codeHash(challengeId: string, code: string): string {
    return createHmac('sha256', this.hashKey).update(`${challengeId}:${code}`).digest('hex')
  }

  private outboxFor(executor: QueryExecutor): MfaEmailOutbox {
    return this.outbox ?? new EmailOutboxService(new EmailOutboxRepository(executor))
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database) return this.database.transaction(work)
    return work(this.database)
  }
}

function hashRecoveryCode(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase().replaceAll('-', '')).digest('hex')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`
}
