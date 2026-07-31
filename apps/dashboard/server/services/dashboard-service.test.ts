import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { DashboardService } from './dashboard-service'
import { HealthService } from './health-service'
import { ScheduledTaskService } from './scheduled-task-service'
import { CloudflareRepository } from '../repositories/cloudflare-repository'
import { SiteService } from './site-service'

describe('Dashboard functional foundation', () => {
  it('calculates aggregates from real health summaries and paginates managed sites', async () => {
    const database = await createTestDatabase()
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const siteService = new SiteService(sites, audit)
    const health = new HealthService(new CheckInRepository(database), sites, audit)
    const dashboard = new DashboardService(siteService, health, audit, new ScheduledTaskService(), new CloudflareRepository(database))
    const healthy = await siteService.create({ name: 'Healthy', url: 'https://healthy.example.com' })
    const attention = await siteService.create({ name: 'Attention', url: 'https://attention.example.com' })
    await siteService.create({ name: 'Unknown', url: 'https://unknown.example.com' })
    await health.recordCheckIn({ siteId: healthy.id, status: 'healthy' })
    await health.recordCheckIn({ siteId: attention.id, status: 'attention', pluginUpdateCount: 2 })

    const overview = await dashboard.getOverview(1, 2, '', new Date())

    assert.equal(overview.aggregates.totalManagedSites, 3)
    assert.equal(overview.aggregates.healthySites, 1)
    assert.equal(overview.aggregates.attentionSites, 1)
    assert.equal(overview.aggregates.unknownSites, 1)
    assert.equal(overview.sites.items.length, 2)
    assert.equal(overview.sites.totalPages, 2)
    assert.equal(overview.sites.items[0]?.uptimeStatus, 'unknown')
    assert.equal(overview.recentActivity.length > 0, true)
    assert.equal(overview.scheduledTasks.length, 4)
    await destroyTestDatabase(database)
  })

  it('escalates stale check-ins deterministically', async () => {
    const database = await createTestDatabase()
    const sites = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const siteService = new SiteService(sites, audit)
    const health = new HealthService(new CheckInRepository(database), sites, audit)
    const site = await siteService.create({ name: 'Stale', url: 'https://stale.example.com' })
    await health.recordCheckIn({ siteId: site.id, status: 'healthy' })
    const latest = (await health.getLatestSnapshot(site.id))!

    assert.equal((await health.getSummary(site.id, new Date(Date.parse(latest.createdAt) + 25 * 60 * 60 * 1000))).status, 'attention')
    assert.equal((await health.getSummary(site.id, new Date(Date.parse(latest.createdAt) + 73 * 60 * 60 * 1000))).status, 'critical')
    await destroyTestDatabase(database)
  })
})
