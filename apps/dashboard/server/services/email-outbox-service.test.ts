import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { EmailProvider } from '../email/types'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { PostgresDatabase } from '../utils/database'
import { EmailOutboxService, EmailOutboxWorkerService } from './email-outbox-service'

let database: PostgresDatabase

before(async () => {
  database = await createTestDatabase()
})

after(async () => {
  await destroyTestDatabase(database)
})

test('durable email outbox is idempotent and records provider delivery', async () => {
  const repository = new EmailOutboxRepository(database)
  const service = new EmailOutboxService(repository)
  await service.enqueue('test', 'same-message', {
    recipientEmail: 'person@example.com',
    subject: 'Subject',
    textContent: 'Text',
    htmlContent: '<p>Text</p>'
  })
  await service.enqueue('test', 'same-message', {
    recipientEmail: 'person@example.com',
    subject: 'Subject',
    textContent: 'Text',
    htmlContent: '<p>Text</p>'
  })
  const provider: EmailProvider = {
    async send(message) {
      assert.equal(message.recipientEmail, 'person@example.com')
      return { messageId: 'brevo-message-1' }
    }
  }
  assert.equal(await new EmailOutboxWorkerService(repository, provider).runOnce(), true)
  assert.equal(await new EmailOutboxWorkerService(repository, provider).runOnce(), false)
  const result = await database.query<{ status: string, provider_message_id: string }>('SELECT status, provider_message_id FROM email_outbox')
  assert.deepEqual(result.rows, [{ status: 'sent', provider_message_id: 'brevo-message-1' }])
})
