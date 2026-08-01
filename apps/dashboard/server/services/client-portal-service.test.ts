import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { PostgresDatabase } from '../utils/database'
import { ClientPortalService } from './client-portal-service'
import { ClientRegistryService } from './client-registry-service'
import { NotificationService } from './notification-service'

let database: PostgresDatabase

before(async () => { database = await createTestDatabase() })
after(async () => { await destroyTestDatabase(database) })

test('client portal scopes every operational summary and omits internal provider details', async () => {
  const registry = new ClientRegistryService(database)
  const clientA = await registry.createClient('Portal Client A', 'admin@example.com')
  const clientB = await registry.createClient('Portal Client B', 'admin@example.com')
  const siteA = await registry.registerManagedSite({
    name: 'Portal A', url: 'https://portal-a.example.com', clientAccountId: clientA.id,
    planId: 'sitecare-pro', actorIdentifier: 'admin@example.com', notes: 'internal secret note'
  })
  const siteB = await registry.registerManagedSite({
    name: 'Portal B', url: 'https://portal-b.example.com', clientAccountId: clientB.id,
    planId: 'sitecare-core', actorIdentifier: 'admin@example.com'
  })
  await new NotificationService(database).saveRecipient(siteA.id, {
    email: 'owner@example.com', enabled: true, categories: ['updates', 'backup']
  }, 'owner@example.com')

  const overview = await new ClientPortalService(database).overview([siteA.id])
  assert.equal(overview.length, 1)
  assert.equal(overview[0]?.id, siteA.id)
  assert.equal(overview.some(site => site.id === siteB.id), false)
  assert.equal(overview[0]?.service.planName, 'SiteCare Pro')
  assert.equal(overview[0]?.uptime.included, true)
  assert.equal(overview[0]?.backups.sitecare.retentionMonths, 24)
  assert.equal(overview[0]?.notificationRecipients[0]?.email, 'owner@example.com')
  assert.equal(JSON.stringify(overview).includes('internal secret note'), false)
  assert.equal(JSON.stringify(overview).includes('storagePath'), false)
})
