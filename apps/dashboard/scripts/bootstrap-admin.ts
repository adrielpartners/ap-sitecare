import { createDatabase } from '../server/utils/database'
import { AuthenticationService } from '../server/services/authentication-service'

const email = process.env.SITECARE_BOOTSTRAP_EMAIL?.trim() || ''
const displayName = process.env.SITECARE_BOOTSTRAP_NAME?.trim() || ''
const password = process.env.SITECARE_BOOTSTRAP_PASSWORD || ''
const databaseUrl = process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'

if (!email || !displayName || !password) {
  throw new Error(
    'SITECARE_BOOTSTRAP_EMAIL, SITECARE_BOOTSTRAP_NAME, and SITECARE_BOOTSTRAP_PASSWORD are required.'
  )
}

const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-admin-bootstrap' })
try {
  const user = await new AuthenticationService(database).bootstrapAdministrator(email, displayName, password)
  process.stdout.write(`Created SiteCare administrator ${user.email}.\n`)
} finally {
  await database.close()
}
