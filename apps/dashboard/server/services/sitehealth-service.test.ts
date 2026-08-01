import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { PageSpeedClient } from '../integrations/pagespeed-client'
import { AuditRepository } from '../repositories/audit-repository'
import { EmailOutboxRepository } from '../repositories/email-outbox-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { ClientRegistryService } from './client-registry-service'
import { NotificationService } from './notification-service'
import { SiteHealthService } from './sitehealth-service'
import { normalizePluginSiteHealthEvidence } from './sitehealth-plugin-evidence'
import { SiteService } from './site-service'

describe('Phase 8 SiteHealth Checkups and Reviews', () => {
  it('normalizes privacy-conscious WordPress evidence without accepting account emails or claiming last activity', () => {
    const normalized = normalizePluginSiteHealthEvidence({
      collectedAt: '2026-08-01T12:00:00.000Z',
      content: { publishedPageCount: 1, pages: [{ id: 1, title: 'About', url: 'https://example.com/about/', modifiedAt: '2024-01-01T00:00:00Z', wordCount: 250 }] },
      media: { attachmentCount: 0, totalBytes: 0, largeImages: [], optimizationCandidates: [], unusedCandidates: [] },
      users: { userCount: 1, accounts: [{ id: 2, displayName: 'Site Admin', roles: ['administrator'], registeredAt: '2020-01-01T00:00:00Z', email: 'must-not-be-stored@example.com' }] },
      environment: { wordpressVersion: '6.8.2', phpVersion: '8.3.10', homeUrl: 'https://example.com/', homeUsesHttps: true, uploadsBytes: 0, wordpressBytes: 0 },
      database: { sizeBytes: 1000, tableCount: 12, revisionCount: 0, transientCount: 0, expiredTransientCount: 0, autoloadBytes: 100 },
      limitations: []
    })
    assert.equal(normalized?.users.lastActivityAvailable, false)
    assert.equal(JSON.stringify(normalized).includes('must-not-be-stored'), false)
  })

  it('normalizes attributable PageSpeed lab and field evidence for each requested strategy', async () => {
    let requestedUrl = ''
    const client = new PageSpeedClient('', (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        analysisUTCTimestamp: '2026-08-01T12:00:00.000Z',
        loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400, category: 'AVERAGE' } } },
        lighthouseResult: {
          finalUrl: 'https://example.com/', categories: { performance: { score: 0.91 } },
          audits: { 'largest-contentful-paint': { numericValue: 2300, displayValue: '2.3 s', score: 0.8, title: 'Largest Contentful Paint' } }
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch, 'https://pagespeed.example.test/run')
    const result = await client.analyze('https://example.com/', 'mobile')
    assert.equal(result.performanceScore, 91)
    assert.equal(result.coreWebVitals.largestContentfulPaint.percentile, 2400)
    assert.equal(result.labMetrics.largestContentfulPaint.numericValue, 2300)
    assert.match(requestedUrl, /strategy=mobile/)
    assert.match(requestedUrl, /category=performance/)
  })

  it('allows a manual Checkup on any plan and enforces approval before technician cleanup initiation', async () => {
    const database = await createTestDatabase()
    const audit = new AuditService(new AuditRepository(database))
    const site = await new SiteService(new SiteRepository(database), audit).create({
      name: 'SiteHealth Test',
      url: 'https://sitehealth.example.com'
    })
    const collectedAt = '2026-08-01T12:00:00.000Z'
    const evidenceId = randomUUID()
    const recommendationId = randomUUID()
    const collector = {
      async collect(checkup: { id: string, siteId: string }) {
        return {
          evidenceCheckInId: null,
          evidence: [{
            id: evidenceId, checkupId: checkup.id, siteId: site.id,
            area: 'database', metricKey: 'wordpress.database', source: 'wordpress-plugin',
            availability: 'available', summary: '150 revisions detected.',
            value: { revisionCount: 150 }, observedAt: collectedAt, createdAt: collectedAt
          }],
          findings: [{
            id: randomUUID(), checkupId: checkup.id, siteId: site.id, evidenceId,
            area: 'database', title: 'Post revisions may be cleaned up',
            description: '150 revisions are stored.', severity: 'low', origin: 'automated',
            status: 'active', technicianNotes: null, sortOrder: 0,
            createdBy: 'system:sitehealth', createdAt: collectedAt, updatedAt: collectedAt
          }],
          recommendations: [{
            id: recommendationId, checkupId: checkup.id, siteId: site.id,
            area: 'database', actionType: 'clear-revisions',
            title: 'Clear approved excess revisions', description: 'Verify a current backup first.',
            priority: 'low', status: 'proposed', createdBy: 'system:sitehealth',
            createdAt: collectedAt, updatedAt: collectedAt
          }]
        }
      }
    }
    const service = new SiteHealthService(database, {
      sitecareBaseUrl: 'https://sitecare.example.com',
      pageSpeedApiKey: '',
      pageSpeedApiBaseUrl: 'https://pagespeed.invalid'
    }, collector as never)

    const checkup = await service.requestManualCheckup(site.id, 'technician@example.com')
    assert.equal(checkup.triggerType, 'manual')
    assert.equal(checkup.status, 'queued')
    await service.runCheckup(checkup.id)
    const detail = await service.getCheckup(checkup.id)
    assert.equal(detail.checkup.status, 'draft-ready')
    assert.equal(detail.reviews[0]?.status, 'draft')
    assert.equal(detail.evidence[0]?.source, 'wordpress-plugin')
    assert.equal(detail.recommendations[0]?.actionType, 'clear-revisions')

    const firstPublished = await service.publish(checkup.id, 'technician@example.com')
    await service.saveFinding(checkup.id, {
      ...detail.findings[0]!,
      description: 'Technician confirmed the revision count and recommends a guarded cleanup.',
      technicianNotes: 'Internal technician context must not reach the client.'
    }, 'technician@example.com')
    const published = await service.publish(checkup.id, 'technician@example.com')
    assert.equal(published.status, 'published')
    assert.equal(published.version, firstPublished.version + 1)
    assert.equal((await service.getPublishedReview(firstPublished.id)).status, 'superseded')
    assert.equal(published.content.recommendations[0]?.id, recommendationId)
    const clientReview = await service.getClientPublishedReview(published.id)
    assert.deepEqual(clientReview.content.evidence[0]?.value, {})
    assert.equal(clientReview.content.findings[0]?.technicianNotes, null)
    assert.equal(JSON.stringify(clientReview).includes('technician@example.com'), false)
    assert.equal(JSON.stringify(clientReview).includes('Internal technician context'), false)
    assert.equal((await service.listClientPublishedReviews([])).length, 0)
    await assert.rejects(
      service.sendReview(published.id, 'technician@example.com'),
      /Configure at least one enabled SiteHealth email recipient/
    )
    assert.equal((await service.getPublishedReview(published.id)).status, 'published')
    await new NotificationService(database).saveRecipient(site.id, {
      email: 'client@example.com', enabled: true, categories: ['sitehealth']
    }, 'admin@example.com')
    const sent = await service.sendReview(published.id, 'technician@example.com')
    assert.equal(sent.recipientCount, 1)
    const messages = await new EmailOutboxRepository(database).list({ siteId: site.id })
    assert.equal(messages[0]?.notificationCategory, 'sitehealth')
    assert.match(messages[0]?.textContent ?? '', /Email us to confirm/)
    assert.match(messages[0]?.textContent ?? '', /Evidence availability/)

    const approval = await service.recordApproval(published.id, {
      status: 'approved-all', source: 'external-email', notes: 'Client approved all recommendations by email.'
    }, 'technician@example.com')
    assert.equal(approval.cleanupProposals[0]?.status, 'approved')
    const initiated = await service.initiateCleanupProposal(
      approval.cleanupProposals[0]!.id,
      'Planning only; no automated executor.',
      'technician@example.com'
    )
    assert.equal(initiated.status, 'initiated')
    const auditEvents = await new AuditRepository(database).listForSite(site.id)
    assert.equal(auditEvents.some(event => event.eventType === 'sitehealth.cleanup.initiated-manually'), true)
    await destroyTestDatabase(database)
  })

  it('does not create cleanup proposals for a partial external response', async () => {
    const database = await createTestDatabase()
    const audit = new AuditService(new AuditRepository(database))
    const site = await new SiteService(new SiteRepository(database), audit).create({ name: 'Partial Approval', url: 'https://partial.example.com' })
    const collector = {
      async collect(checkup: { id: string }) {
        const now = new Date().toISOString()
        return {
          evidenceCheckInId: null,
          evidence: [], findings: [], recommendations: [{
            id: randomUUID(), checkupId: checkup.id, siteId: site.id, area: 'media', actionType: 'compress-images',
            title: 'Compress images', description: 'Compress approved images.', priority: 'medium', status: 'proposed',
            createdBy: 'system:sitehealth', createdAt: now, updatedAt: now
          }]
        }
      }
    }
    const service = new SiteHealthService(database, {
      sitecareBaseUrl: 'https://sitecare.example.com', pageSpeedApiKey: '', pageSpeedApiBaseUrl: 'https://pagespeed.invalid'
    }, collector as never)
    const checkup = await service.requestManualCheckup(site.id, 'technician@example.com')
    await service.runCheckup(checkup.id)
    const review = await service.publish(checkup.id, 'technician@example.com')
    const result = await service.recordApproval(review.id, {
      status: 'partial', source: 'external-email', notes: 'Client requested a revised scope.'
    }, 'technician@example.com')
    assert.equal(result.cleanupProposals.length, 0)
    await destroyTestDatabase(database)
  })

  it('schedules Plus annual Checkups within 30 days, deduplicates the cycle, and advances from completion', async () => {
    const database = await createTestDatabase()
    const clients = new ClientRegistryService(database)
    const client = await clients.createClient('Annual Client', 'admin@example.com')
    const site = await clients.registerManagedSite({
      name: 'Annual Site', url: 'https://annual.example.com', clientAccountId: client.id,
      planId: 'sitecare-plus', actorIdentifier: 'admin@example.com'
    })
    const collector = {
      async collect() { return { evidenceCheckInId: null, evidence: [], findings: [], recommendations: [] } }
    }
    const service = new SiteHealthService(database, {
      sitecareBaseUrl: 'https://sitecare.example.com', pageSpeedApiKey: '', pageSpeedApiBaseUrl: 'https://pagespeed.invalid'
    }, collector as never)
    const eligibleAt = new Date(site.createdAt)
    await service.syncAnnualPolicies(new Date(eligibleAt.getTime() + 29 * 86_400_000))
    const before = await service.getSiteOverview(site.id)
    assert.equal(before.annualPolicy?.nextDueAt, new Date(eligibleAt.getTime() + 30 * 86_400_000).toISOString())

    const dueAt = new Date(eligibleAt.getTime() + 31 * 86_400_000)
    const first = await service.planDueAnnualCheckups(dueAt)
    const duplicate = await service.planDueAnnualCheckups(dueAt)
    assert.equal(first.queued.length, 1)
    assert.equal(duplicate.queued.length, 0)
    assert.match(duplicate.skipped[0]?.reason ?? '', /annual-cycle-already-queued/)
    const annual = (await service.list([site.id])).filter(item => item.triggerType === 'annual')
    assert.equal(annual.length, 1)

    await service.runCheckup(annual[0]!.id)
    const completed = await service.getSiteOverview(site.id)
    assert.equal(completed.annualPolicy?.lastCheckupId, annual[0]!.id)
    assert.equal(
      completed.annualPolicy?.nextDueAt,
      new Date(new Date(completed.annualPolicy!.lastCompletedAt!).setUTCFullYear(new Date(completed.annualPolicy!.lastCompletedAt!).getUTCFullYear() + 1)).toISOString()
    )
    await destroyTestDatabase(database)
  })

  it('rechecks annual entitlement at worker execution and cancels suspended work without collecting', async () => {
    const database = await createTestDatabase()
    const clients = new ClientRegistryService(database)
    const client = await clients.createClient('Suspended Annual Client', 'admin@example.com')
    const site = await clients.registerManagedSite({
      name: 'Suspended Annual Site', url: 'https://suspended-annual.example.com', clientAccountId: client.id,
      planId: 'sitecare-plus', actorIdentifier: 'admin@example.com'
    })
    const collector = {
      async collect() { throw new Error('Collection must not run after entitlement is suspended.') }
    }
    const service = new SiteHealthService(database, {
      sitecareBaseUrl: 'https://sitecare.example.com', pageSpeedApiKey: '', pageSpeedApiBaseUrl: 'https://pagespeed.invalid'
    }, collector as never)
    const dueAt = new Date(new Date(site.createdAt).getTime() + 31 * 86_400_000)
    const planned = await service.planDueAnnualCheckups(dueAt)
    assert.equal(planned.queued.length, 1)
    await clients.changeClientStatus(client.id, 'suspended', 'Pause annual services.', 'admin@example.com')
    const result = await service.runCheckup(planned.queued[0]!)
    assert.equal('skipped' in result && result.skipped, true)
    assert.equal((await service.getCheckup(planned.queued[0]!)).checkup.status, 'cancelled')
    await destroyTestDatabase(database)
  })
})
