import { setTimeout as delay } from 'node:timers/promises'
import { createDatabase } from '../server/utils/database'
import { AuditRepository } from '../server/repositories/audit-repository'
import { BackupRepository } from '../server/repositories/backup-repository'
import { SiteRepository } from '../server/repositories/site-repository'
import { AuditService } from '../server/services/audit-service'
import { BackupWorkerService } from '../server/services/backup-worker-service'
import { BackupDestinationRepository } from '../server/repositories/backup-destination-repository'
import { BackupDestinationService } from '../server/services/backup-destination-service'
import { SiteService } from '../server/services/site-service'
import { logOperationalEvent, safeOperationalError } from '../server/utils/structured-logger'

const databaseUrl = process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'
const database = createDatabase(databaseUrl, { applicationName: 'ap-sitecare-backup-worker' })
const settings = {
  allowedLocalBaseDirectories: split(process.env.NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES),
  credentialEncryptionKey: process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY || '',
  dropboxAccessToken: process.env.NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN || '',
  dropboxRefreshToken: process.env.NUXT_INTEGRATIONS_DROPBOX_REFRESH_TOKEN || '',
  dropboxAppKey: process.env.NUXT_INTEGRATIONS_DROPBOX_APP_KEY || '',
  dropboxAppSecret: process.env.NUXT_INTEGRATIONS_DROPBOX_APP_SECRET || '',
  dropboxRedirectUri: process.env.NUXT_INTEGRATIONS_DROPBOX_REDIRECT_URI || '',
  dropboxBackupRoot: process.env.NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT || '',
  dropboxAccountLabel: process.env.NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL || '',
  dropboxEnabled: process.env.NUXT_BACKUPS_DROPBOX_ENABLED !== 'false',
  dropboxTokenStrategy: process.env.NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY === 'oauth' ? 'oauth' as const : 'runtime-access-token' as const,
  tempRoot: process.env.NUXT_BACKUPS_TEMP_ROOT || '/tmp/ap-sitecare-backups',
  staleAfterMinutes: positiveInteger(process.env.NUXT_BACKUPS_STALE_AFTER_MINUTES, 60)
}
const auditService = new AuditService(new AuditRepository(database))
const siteRepository = new SiteRepository(database)
const siteService = new SiteService(siteRepository, auditService)
const destinationService = new BackupDestinationService(settings, new BackupDestinationRepository(database), auditService, siteService)
const worker = new BackupWorkerService(
  settings,
  new BackupRepository(database),
  siteRepository,
  auditService,
  undefined,
  undefined,
  destinationService
)
const continuous = process.argv.includes('--continuous')
let stopping = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true
  })
}

try {
  do {
    const result = await worker.runNext()
    if (!continuous || stopping) break
    if (!result) await delay(5000)
  } while (!stopping)
} catch (error) {
  logOperationalEvent('error', 'backup-worker.crashed', safeOperationalError(error))
  process.exitCode = 1
} finally {
  await database.close()
}

function split(value: string | undefined): string[] {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
