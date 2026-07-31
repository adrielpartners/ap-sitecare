import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { EmailProvider } from '../email/types'
import { AuditRepository } from '../repositories/audit-repository'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { NotificationRepository } from '../repositories/notification-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { RuntimeSettings } from '../utils/config'
import type { PostgresDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import { EmailConfigurationService } from './email-configuration-service'
import { EmailOutboxService, EmailOutboxWorkerService } from './email-outbox-service'
import { EmailWebhookService, NotificationService } from './notification-service'
import { SiteService } from './site-service'

let database: PostgresDatabase
let siteId: string

const runtime: Pick<RuntimeSettings, 'email' | 'credentialEncryptionKey'> = {
  email: {
    provider: 'brevo',
    brevoApiKey: '',
    fromAddress: 'runtime@sitecare.example.com',
    fromName: 'Runtime SiteCare',
    replyTo: '',
    webhookBearerToken: ''
  },
  credentialEncryptionKey: 'phase-4-notification-test-key'
}

before(async () => {
  database = await createTestDatabase()
  const audit = new AuditService(new AuditRepository(database))
  const site = await new SiteService(new SiteRepository(database), audit).create({
    name: 'Notification Test Site',
    url: 'https://notifications.example.com'
  })
  siteId = site.id
})

after(async () => {
  await destroyTestDatabase(database)
})

test('site notification fan-out is recipient-specific and idempotent', async () => {
  const service = new NotificationService(database)
  await service.saveRecipient(siteId, {
    email: 'owner@example.com',
    displayName: 'Site Owner',
    enabled: true,
    categories: ['backup', 'uptime']
  }, 'admin@example.com')
  await service.saveRecipient(siteId, {
    email: 'team@example.com',
    enabled: true,
    categories: ['backup']
  }, 'admin@example.com')
  await service.saveRecipient(siteId, {
    email: 'disabled@example.com',
    enabled: false,
    categories: ['backup']
  }, 'admin@example.com')

  const first = await service.enqueueForSite(siteId, 'backup', 'backup:monthly:2026-07', {
    subject: 'Monthly backup complete',
    textContent: 'The backup completed.',
    htmlContent: '<p>The backup completed.</p>'
  }, {
    messageType: 'backup-completed',
    templateKey: 'backup-completed-v1',
    metadata: { backupId: 'backup-123' },
    artifactReference: 'backup:backup-123'
  })
  const duplicate = await service.enqueueForSite(siteId, 'backup', 'backup:monthly:2026-07', {
    subject: 'Monthly backup complete',
    textContent: 'The backup completed.',
    htmlContent: '<p>The backup completed.</p>'
  }, { messageType: 'backup-completed' })

  assert.equal(first.recipientCount, 2)
  assert.deepEqual(duplicate.messageIds.sort(), first.messageIds.sort())
  const messages = await new EmailOutboxRepository(database).list({ siteId })
  assert.equal(messages.length, 2)
  assert.deepEqual(messages.map(message => message.recipientEmail).sort(), ['owner@example.com', 'team@example.com'])
  assert.equal(messages.every(message => message.notificationCategory === 'backup'), true)
  await database.query('DELETE FROM email_outbox')
})

test('outbox retries are bounded, stale leases recover, and accepted bodies are purged', async () => {
  const repository = new EmailOutboxRepository(database)
  const outbox = new EmailOutboxService(repository)
  await assert.rejects(() => outbox.enqueue('unsafe-email', 'unsafe-email', {
    recipientEmail: 'safe@example.com',
    subject: 'Unsafe metadata',
    textContent: 'Text',
    htmlContent: '<p>Text</p>'
  }, { metadata: { provider: { apiKey: 'must-not-persist' } } }), /cannot contain credentials/)
  const stale = await outbox.enqueue('stale-email', 'stale-email', {
    recipientEmail: 'stale@example.com',
    subject: 'Stale lease',
    textContent: 'Sensitive rendered body',
    htmlContent: '<p>Sensitive rendered body</p>'
  }, { maxAttempts: 2 })
  const now = new Date()
  const claimed = await repository.claim(now.toISOString(), new Date(now.getTime() - 1_000).toISOString())
  assert.equal(claimed?.id, stale.id)
  assert.equal(await repository.recoverStale(now.toISOString()), 1)

  const sent: string[] = []
  const provider: EmailProvider = {
    async send(message) {
      sent.push(message.recipientEmail)
      return { messageId: `provider-${sent.length}` }
    }
  }
  assert.equal(await new EmailOutboxWorkerService(repository, provider).runOnce(), true)
  const completed = await repository.findById(stale.id)
  assert.equal(completed?.status, 'sent')
  assert.equal(completed?.attemptCount, 2)
  assert.equal(completed?.textContent, '')
  assert.equal(completed?.htmlContent, '')

  const terminal = await outbox.enqueue('terminal-email', 'terminal-email', {
    recipientEmail: 'failure@example.com',
    subject: 'Terminal failure',
    textContent: 'Rendered text',
    htmlContent: '<p>Rendered HTML</p>'
  }, { maxAttempts: 1 })
  const failingProvider: EmailProvider = {
    async send() {
      throw new Error('Bearer should-never-appear-in-history')
    }
  }
  assert.equal(await new EmailOutboxWorkerService(repository, failingProvider).runOnce(), true)
  const failed = await repository.findById(terminal.id)
  assert.equal(failed?.status, 'failed')
  assert.ok(failed?.completedAt)
  assert.equal(failed?.textContent, '')
  assert.equal(failed?.htmlContent, '')
  assert.equal(failed?.lastError?.includes('should-never-appear'), false)
})

test('Brevo webhook delivery is deduplicated and hard bounces suppress recipients', async () => {
  const repository = new EmailOutboxRepository(database)
  const outbox = new EmailOutboxService(repository)
  const message = await outbox.enqueue('provider-event', 'provider-event', {
    recipientEmail: 'bounce@example.com',
    subject: 'Provider event',
    textContent: 'Text',
    htmlContent: '<p>Text</p>'
  })
  const provider: EmailProvider = {
    async send() {
      return { messageId: 'brevo-provider-message' }
    }
  }
  await new EmailOutboxWorkerService(repository, provider).runOnce()
  const webhook = new EmailWebhookService(database)
  const payload = {
    id: 9001,
    event: 'hard_bounce',
    email: 'bounce@example.com',
    'message-id': 'brevo-provider-message',
    ts_event: Math.floor(Date.now() / 1000),
    reason: 'Mailbox unavailable'
  }
  assert.equal((await webhook.recordBrevo(payload)).duplicate, false)
  assert.equal((await webhook.recordBrevo(payload)).duplicate, true)
  assert.equal((await repository.findById(message.id))?.status, 'bounced')
  assert.equal(await new NotificationRepository(database).isSuppressed('bounce@example.com'), true)
  await webhook.recordBrevo({
    ...payload,
    id: 9002,
    event: 'delivered',
    ts_event: Number(payload.ts_event) + 1
  })
  assert.equal((await repository.findById(message.id))?.status, 'bounced')
  await webhook.recordBrevo({
    id: 9003,
    event: 'spam',
    email: 'complaint@example.com',
    'message-id': 'unmatched-provider-message',
    ts_event: Number(payload.ts_event) + 2
  })
  assert.equal(await new NotificationRepository(database).isSuppressed('complaint@example.com'), true)
  assert.equal((await new NotificationRepository(database).listDeliveryEvents()).length, 3)
})

test('email settings encrypt provider secrets and expose future adapter status safely', async () => {
  const notificationRepository = new NotificationRepository(database)
  const service = new EmailConfigurationService(
    runtime,
    notificationRepository,
    new AuditService(new AuditRepository(database))
  )
  await service.saveProvider({
    provider: 'brevo',
    apiKey: 'brevo-private-api-key',
    webhookToken: 'brevo-webhook-token'
  }, 'admin@example.com')
  await service.saveProvider({
    provider: 'mailgun',
    apiKey: 'mailgun-private-api-key',
    configuration: { domain: 'mail.example.com', baseUrl: 'https://api.mailgun.net' }
  }, 'admin@example.com')
  const global = await service.saveGlobal({
    selectedProvider: 'brevo',
    fromAddress: 'reports@example.com',
    fromName: 'SiteCare Reports',
    replyTo: 'support@example.com',
    branding: { accentColor: '#5b8cff' }
  }, 'admin@example.com')

  assert.equal(global.fromAddress, 'reports@example.com')
  const settings = await service.getSettings()
  assert.equal(settings.providers.find(item => item.provider === 'brevo')?.apiKeyConfigured, true)
  assert.equal(settings.providers.find(item => item.provider === 'brevo')?.operational, true)
  assert.equal(settings.providers.find(item => item.provider === 'mailgun')?.operational, false)
  assert.equal(JSON.stringify(settings).includes('brevo-private-api-key'), false)
  assert.equal(await service.verifyWebhookBearerToken('brevo', 'brevo-webhook-token'), true)
  assert.equal(await service.verifyWebhookBearerToken('brevo', 'wrong-token'), false)
  await assert.rejects(() => service.resolveProvider('mailgun'), /not operational yet/)
  await assert.rejects(() => service.saveGlobal({
    ...global,
    selectedProvider: 'mailgun'
  }, 'admin@example.com'), /only Brevo can be activated/)

  const raw = await database.query<{ api_key_ciphertext: string }>(
    "SELECT api_key_ciphertext FROM email_provider_configurations WHERE provider = 'brevo'"
  )
  assert.notEqual(raw.rows[0]?.api_key_ciphertext, 'brevo-private-api-key')
})
