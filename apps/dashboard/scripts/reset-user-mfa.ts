import { randomUUID } from 'node:crypto'
import { createDatabase } from '../server/utils/database'

const databaseUrl = process.env.NUXT_DATABASE_URL || ''
const email = (process.env.SITECARE_MFA_RESET_EMAIL || '').trim().toLowerCase()
const reason = (process.env.SITECARE_MFA_RESET_REASON || '').trim()
if (!databaseUrl || !email || reason.length < 10) {
  throw new Error('NUXT_DATABASE_URL, SITECARE_MFA_RESET_EMAIL, and a specific SITECARE_MFA_RESET_REASON of at least 10 characters are required.')
}

const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-mfa-reset', maxConnections: 2 })
try {
  const user = await database.transaction(async executor => {
    const result = await executor.query<{ id: string, email: string }>('SELECT id,email FROM users WHERE LOWER(email)=LOWER($1) AND status=$2 FOR UPDATE', [email, 'active'])
    const target = result.rows[0]
    if (!target) throw new Error('Active user not found.')
    const now = new Date().toISOString()
    await executor.query('UPDATE user_mfa_factors SET disabled_at=$2 WHERE user_id=$1 AND disabled_at IS NULL', [target.id, now])
    await executor.query('UPDATE users SET mfa_enrolled_at=NULL,updated_at=$2 WHERE id=$1', [target.id, now])
    await executor.query('UPDATE auth_sessions SET revoked_at=$2,revoked_by=$3 WHERE user_id=$1 AND revoked_at IS NULL', [target.id, now, 'system:mfa-recovery-cli'])
    await executor.query(`
      INSERT INTO audit_events (id,site_id,actor_type,actor_identifier,event_type,metadata_json,created_at)
      VALUES ($1,NULL,'system','mfa-recovery-cli','mfa.emergency-reset',$2::jsonb,$3)
    `, [randomUUID(), JSON.stringify({ userId: target.id, email: target.email, reason: reason.slice(0, 1_000) }), now])
    return target
  })
  console.log(JSON.stringify({ ok: true, userId: user.id, email: user.email, sessionsRevoked: true }))
} finally {
  await database.close()
}
