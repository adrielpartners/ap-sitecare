import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'

interface FactorRow {
  id: string
  user_id: string
  secret_ciphertext: string
  recovery_codes_json: unknown
  verified_at: string | null
}

export class MfaService {
  constructor(
    private readonly encryptionKey: string,
    private readonly database: QueryExecutor = useDatabase(),
    private readonly audit = new AuditService()
  ) {}

  async beginEnrollment(userId: string, email: string): Promise<{ secret: string, otpauthUri: string }> {
    const existing = await this.activeFactor(userId)
    if (existing?.verified_at) throw new Error('MFA is already enrolled for this account.')
    const secret = base32Encode(randomBytes(20))
    const now = new Date().toISOString()
    await this.database.query(`
      UPDATE user_mfa_factors SET disabled_at=$2
      WHERE user_id=$1 AND factor_type='totp' AND disabled_at IS NULL
    `, [userId, now])
    await this.database.query(`
      INSERT INTO user_mfa_factors (
        id,user_id,factor_type,secret_ciphertext,recovery_codes_json,created_at,verified_at,disabled_at
      ) VALUES ($1,$2,'totp',$3,'[]'::jsonb,$4,NULL,NULL)
    `, [randomUUID(), userId, encryptSecret(secret, this.encryptionKey), now])
    const label = encodeURIComponent(`AP SiteCare:${email}`)
    const issuer = encodeURIComponent('AP SiteCare')
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: userId, eventType: 'mfa.enrollment-started', metadata: {} })
    return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` }
  }

  async completeEnrollment(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const factor = await this.activeFactor(userId)
    if (!factor || factor.verified_at) throw new Error('No pending MFA enrollment was found.')
    const secret = decryptSecret(factor.secret_ciphertext, this.encryptionKey)
    if (!verifyTotp(secret, code)) throw new Error('The verification code is not valid.')
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(6).toString('hex'))
    const hashes = recoveryCodes.map(hashRecoveryCode)
    const now = new Date().toISOString()
    await this.database.query(`UPDATE user_mfa_factors SET verified_at=$2,recovery_codes_json=$3::jsonb,last_used_at=$2 WHERE id=$1`, [factor.id, now, JSON.stringify(hashes)])
    await this.database.query(`UPDATE users SET mfa_enrolled_at=$2,updated_at=$2 WHERE id=$1`, [userId, now])
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: userId, eventType: 'mfa.enrolled', metadata: { factorType: 'totp' } })
    return { recoveryCodes }
  }

  async verifyStepUp(userId: string, code: string): Promise<void> {
    const factor = await this.activeFactor(userId)
    if (!factor?.verified_at) throw new Error('Enroll an authenticator before approving a high-risk operation.')
    const normalized = code.trim().toLowerCase().replaceAll('-', '')
    const secret = decryptSecret(factor.secret_ciphertext, this.encryptionKey)
    let method: 'totp' | 'recovery' | null = verifyTotp(secret, normalized) ? 'totp' : null
    let consumedRecoveryHash: string | null = null
    let recoveryHashes = Array.isArray(factor.recovery_codes_json)
      ? factor.recovery_codes_json.filter((value): value is string => typeof value === 'string')
      : []
    if (!method) {
      const hash = hashRecoveryCode(normalized)
      const index = recoveryHashes.findIndex(candidate => safeEqual(candidate, hash))
      if (index >= 0) {
        consumedRecoveryHash = recoveryHashes[index]!
        recoveryHashes = recoveryHashes.filter((_, candidateIndex) => candidateIndex !== index)
        method = 'recovery'
      }
    }
    if (!method) {
      await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: userId, eventType: 'mfa.step-up-failed', metadata: {} })
      throw new Error('The MFA code is not valid.')
    }
    const now = new Date().toISOString()
    if (method === 'recovery') {
      const updated = await this.database.query(`
        UPDATE user_mfa_factors SET recovery_codes_json=$2::jsonb,last_used_at=$3
        WHERE id=$1 AND recovery_codes_json @> $4::jsonb
      `, [factor.id, JSON.stringify(recoveryHashes), now, JSON.stringify([consumedRecoveryHash])])
      if (updated.rowCount !== 1) {
        await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: userId, eventType: 'mfa.step-up-failed', metadata: { reason: 'recovery-code-replayed' } })
        throw new Error('The MFA recovery code was already used.')
      }
    } else {
      await this.database.query(`UPDATE user_mfa_factors SET last_used_at=$2 WHERE id=$1`, [factor.id, now])
    }
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: userId, eventType: 'mfa.step-up-succeeded', metadata: { method } })
  }

  private async activeFactor(userId: string): Promise<FactorRow | null> {
    const result = await this.database.query<FactorRow>(`
      SELECT * FROM user_mfa_factors WHERE user_id=$1 AND factor_type='totp' AND disabled_at IS NULL LIMIT 1
    `, [userId])
    return result.rows[0] ?? null
  }
}

export function generateTotp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 30_000)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return value.toString().padStart(6, '0')
}

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false
  return [-30_000, 0, 30_000].some(offset => safeEqual(generateTotp(secret, at + offset), code))
}

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let accumulator = 0
  const bytes: number[] = []
  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('The MFA secret is invalid.')
    accumulator = (accumulator << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hashRecoveryCode(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase().replaceAll('-', '')).digest('hex')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
