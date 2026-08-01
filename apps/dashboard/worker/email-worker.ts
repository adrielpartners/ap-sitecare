import { setTimeout as delay } from 'node:timers/promises'
import { EmailOutboxRepository } from '../server/repositories/email-outbox-repository'
import { NotificationRepository } from '../server/repositories/notification-repository'
import { EmailConfigurationService } from '../server/services/email-configuration-service'
import { EmailOutboxWorkerService } from '../server/services/email-outbox-service'
import { createDatabase } from '../server/utils/database'
import { logOperationalEvent, safeOperationalError } from '../server/utils/structured-logger'

const databaseUrl = process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'
const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-email-worker' })
const configuration = new EmailConfigurationService({
  email: {
    provider: 'brevo',
    brevoApiKey: process.env.NUXT_EMAIL_BREVO_API_KEY || '',
    fromAddress: process.env.NUXT_EMAIL_FROM_ADDRESS || '',
    fromName: process.env.NUXT_EMAIL_FROM_NAME || 'SiteCare',
    replyTo: process.env.NUXT_EMAIL_REPLY_TO || '',
    webhookBearerToken: process.env.NUXT_EMAIL_WEBHOOK_BEARER_TOKEN || ''
  },
  credentialEncryptionKey: process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY || ''
}, new NotificationRepository(database))
const worker = new EmailOutboxWorkerService(new EmailOutboxRepository(database), configuration)
const continuous = process.argv.includes('--continuous')
let stopping = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true
  })
}

try {
  do {
    const handled = await worker.runOnce()
    if (!continuous || stopping) break
    if (!handled) await delay(5000)
  } while (!stopping)
} catch (error) {
  logOperationalEvent('error', 'email-worker.crashed', safeOperationalError(error))
  process.exitCode = 1
} finally {
  await database.close()
}
