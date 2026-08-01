import { randomUUID } from 'node:crypto'
import { createDatabase } from '../server/utils/database'
import { decryptSecret, encryptSecret } from '../server/utils/credential-crypto'

const databaseUrl = process.env.NUXT_DATABASE_URL || ''
const currentKey = process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY || ''
const nextKey = process.env.SITECARE_NEW_CREDENTIAL_ENCRYPTION_KEY || ''
if (!databaseUrl || !currentKey || !nextKey) {
  throw new Error('NUXT_DATABASE_URL, NUXT_CREDENTIAL_ENCRYPTION_KEY, and SITECARE_NEW_CREDENTIAL_ENCRYPTION_KEY are required.')
}
if (currentKey === nextKey) throw new Error('The new credential encryption key must differ from the current key.')

const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-key-rotation', maxConnections: 2 })
const columns = [
  { table: 'site_credentials', id: 'id', column: 'secret_ciphertext' },
  { table: 'hosting_connections', id: 'site_id', column: 'database_password_ciphertext' },
  { table: 'hosting_connections', id: 'site_id', column: 'credential_ciphertext' },
  { table: 'backup_destinations', id: 'id', column: 'credential_ciphertext' },
  { table: 'email_provider_configurations', id: 'provider', column: 'api_key_ciphertext' },
  { table: 'email_provider_configurations', id: 'provider', column: 'webhook_token_ciphertext' },
  { table: 'user_mfa_factors', id: 'id', column: 'secret_ciphertext' },
  { table: 'user_mfa_factors', id: 'id', column: 'destination_ciphertext' }
] as const

try {
  const rotated = await database.transaction(async executor => {
    let count = 0
    for (const item of columns) {
      const records = await executor.query<Record<string, string>>(
        `SELECT ${item.id}, ${item.column} FROM ${item.table} WHERE ${item.column} IS NOT NULL FOR UPDATE`
      )
      for (const record of records.rows) {
        const identifier = record[item.id]
        const ciphertext = record[item.column]
        if (!identifier || !ciphertext) continue
        const plaintext = decryptSecret(ciphertext, currentKey)
        const rotatedCiphertext = encryptSecret(plaintext, nextKey)
        if (decryptSecret(rotatedCiphertext, nextKey) !== plaintext) throw new Error(`Verification failed for ${item.table}.${item.column}.`)
        await executor.query(
          `UPDATE ${item.table} SET ${item.column}=$1 WHERE ${item.id}=$2`,
          [rotatedCiphertext, identifier]
        )
        count += 1
      }
    }
    await executor.query(`
      INSERT INTO audit_events (id,site_id,actor_type,actor_identifier,event_type,metadata_json,created_at)
      VALUES ($1,NULL,'system','credential-key-rotation','security.credential-encryption-key-rotated',$2::jsonb,$3)
    `, [randomUUID(), JSON.stringify({ rotatedCiphertextCount: count }), new Date().toISOString()])
    return count
  })
  console.log(JSON.stringify({ ok: true, rotatedCiphertextCount: rotated }))
} finally {
  await database.close()
}
