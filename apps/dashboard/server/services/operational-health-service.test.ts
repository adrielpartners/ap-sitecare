import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RuntimeSettings } from '../utils/config'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { OperationalHealthService } from './operational-health-service'

function settings(): RuntimeSettings {
  return {
    auth: {
      secureCookies: true, eventHashKey: 'event-key', sessionDays: 30,
      idleHours: 72, trustedDeviceDays: 30, mfaChallengeMinutes: 10
    },
    sms: {
      provider: 'disabled', twilioAccountSid: '', twilioAuthToken: '', twilioFromNumber: ''
    },
    sitecareBaseUrl: 'https://sitecare.example.com',
    email: {
      provider: 'brevo', brevoApiKey: 'brevo-key', fromAddress: 'sitecare@example.com',
      fromName: 'SiteCare', replyTo: 'sitecare@example.com', webhookBearerToken: 'webhook-token'
    },
    integrations: {
      cloudflareApiToken: 'cloudflare-token', cloudflareApiBaseUrl: 'https://api.cloudflare.com/client/v4',
      cloudflareWebhookSecret: '', cloudflareAccountId: '', cloudflareWebhookDestinationId: '',
      cloudflareNotificationPolicyId: '', dropboxAccessToken: '', dropboxRefreshToken: '',
      dropboxAppKey: 'dropbox-app-key', dropboxAppSecret: 'dropbox-app-secret', dropboxRedirectUri: '',
      dropboxBackupRoot: '/', hostingerApiBaseUrl: 'https://developers.hostinger.com',
      hostingerApiToken: 'hostinger-token', pageSpeedApiKey: '',
      pageSpeedApiBaseUrl: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    },
    backups: {
      allowedLocalBaseDirectories: '', dropboxAccountLabel: 'SiteCare Backups',
      dropboxEnabled: true, dropboxTokenStrategy: 'oauth', tempRoot: '/tmp/sitecare-test'
    },
    pluginPackages: { root: '/tmp/sitecare-plugin-packages', maximumBytes: 52_428_800 },
    credentialEncryptionKey: 'credential-key',
    databaseUrl: 'postgresql://sitecare:sitecare@127.0.0.1:54329/sitecare_test'
  }
}

describe('Operational health configuration readiness', () => {
  it('recognizes a dashboard-managed encrypted Dropbox OAuth credential', async () => {
    const database = await createTestDatabase()
    const service = new OperationalHealthService(settings(), database)

    assert.equal((await service.inspect()).configuration.dropboxOAuth, false)

    const now = new Date().toISOString()
    await database.query(`
      INSERT INTO backup_destinations (
        id, name, provider, enabled, in_master_pool, credential_source,
        configuration_json, credential_ciphertext, created_at, updated_at
      ) VALUES ($1, $2, 'dropbox', true, true, 'encrypted', $3::jsonb, $4, $5, $5)
    `, [
      'dashboard-dropbox', 'SiteCare Backups',
      JSON.stringify({ basePath: '/', authMode: 'oauth-refresh-token' }),
      'encrypted-refresh-token', now
    ])

    assert.equal((await service.inspect()).configuration.dropboxOAuth, true)
    await destroyTestDatabase(database)
  })
})
