import { randomUUID } from 'node:crypto'
import type { ClientAccount } from '../auth/types'
import type { Site } from '../domain/types'
import type { ServicePlanId } from '../domain/service-plans'
import { AuditRepository } from '../repositories/audit-repository'
import { IdentityRepository } from '../repositories/identity-repository'
import { SiteRepository } from '../repositories/site-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EntitlementService } from './entitlement-service'
import { SiteService, type CreateSiteInput } from './site-service'

export interface RegisterManagedSiteInput extends CreateSiteInput {
  clientAccountId: string
  planId: ServicePlanId
}

export class ClientRegistryService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async createClient(name: string, actorIdentifier: string): Promise<ClientAccount> {
    const normalized = name.trim()
    if (!normalized) throw new Error('Client name is required.')
    if (normalized.length > 160) throw new Error('Client name must not exceed 160 characters.')
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const client = await new IdentityRepository(executor).createClientAccount({
        id: randomUUID(),
        name: normalized,
        status: 'active',
        isPlaceholder: false,
        createdAt: now,
        updatedAt: now
      })
      await new AuditService(new AuditRepository(executor)).record({
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'client.created',
        metadata: { clientAccountId: client.id, name: client.name }
      })
      return client
    })
  }

  async listClients() {
    const identity = new IdentityRepository(this.database)
    const [clients, assignments] = await Promise.all([
      identity.listClientAccounts(),
      identity.listClientSiteAssignments()
    ])
    const sites = await new SiteService(
      new SiteRepository(this.database),
      new AuditService(new AuditRepository(this.database))
    ).list()
    const siteMap = new Map(sites.map(site => [site.id, site]))
    return Promise.all(clients.map(async client => {
      const siteIds = assignments
        .filter(item => item.clientAccountId === client.id)
        .map(item => item.siteId)
      const service = new EntitlementService(this.database)
      const siteSummaries = await Promise.all(siteIds.map(async siteId => {
        const site = siteMap.get(siteId)
        if (!site) return null
        const effective = await service.get(siteId)
        return {
          id: site.id,
          name: site.name,
          url: site.url,
          status: site.status,
          planId: effective.underlyingPlan.id,
          planName: effective.underlyingPlan.name,
          operationalStatus: effective.operationalStatus,
          pendingTransition: effective.pendingTransition
        }
      }))
      return {
        ...client,
        siteIds,
        sites: siteSummaries.filter(item => item !== null),
        userCount: await identity.countClientUsers(client.id)
      }
    }))
  }

  async getClient(clientAccountId: string) {
    const identity = new IdentityRepository(this.database)
    const client = await identity.findClientAccount(clientAccountId)
    if (!client) throw new Error('Client account not found.')
    const siteIds = await identity.listClientSiteIdsDirect(clientAccountId)
    const sites = await new SiteService(
      new SiteRepository(this.database),
      new AuditService(new AuditRepository(this.database))
    ).list(siteIds)
    const entitlements = new EntitlementService(this.database)
    return {
      client,
      userCount: await identity.countClientUsers(clientAccountId),
      sites: await Promise.all(sites.map(async site => ({
        site,
        service: await entitlements.getManagementDetail(site.id)
      })))
    }
  }

  async renameClient(clientAccountId: string, name: string, actorIdentifier: string): Promise<ClientAccount> {
    const normalized = name.trim()
    if (!normalized) throw new Error('Client name is required.')
    if (normalized.length > 160) throw new Error('Client name must not exceed 160 characters.')
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const repository = new IdentityRepository(executor)
      const existing = await repository.findClientAccount(clientAccountId, true)
      if (!existing) throw new Error('Client account not found.')
      if (existing.isPlaceholder) throw new Error('The migration placeholder client cannot be renamed.')
      const updated = await repository.updateClientAccount({ ...existing, name: normalized, updatedAt: now })
      await new AuditService(new AuditRepository(executor)).record({
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'client.renamed',
        metadata: { clientAccountId, previousName: existing.name, name: normalized }
      })
      return updated
    })
  }

  async changeClientStatus(
    clientAccountId: string,
    status: 'active' | 'suspended',
    reason: string,
    actorIdentifier: string
  ): Promise<void> {
    await new EntitlementService(this.database).changeClientStatus(
      clientAccountId,
      status,
      reason,
      actorIdentifier
    )
  }

  async assignSite(clientAccountId: string, siteId: string, actorIdentifier: string): Promise<void> {
    const now = new Date().toISOString()
    await this.withTransaction(async executor => {
      const identity = new IdentityRepository(executor)
      const client = await identity.findClientAccount(clientAccountId)
      const site = await new SiteRepository(executor).findById(siteId)
      const assignments = await identity.listClientSiteAssignments()
      if (!client) throw new Error('Client account not found.')
      if (!site) throw new Error('Site not found.')
      const previousClientAccountId = assignments.find(item => item.siteId === siteId)?.clientAccountId ?? null
      await identity.assignSiteToClient(siteId, clientAccountId, actorIdentifier, now)
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'site.client-assigned',
        metadata: { previousClientAccountId, clientAccountId }
      })
    })
  }

  async registerManagedSite(input: RegisterManagedSiteInput): Promise<Site> {
    return this.withTransaction(async executor => {
      const identity = new IdentityRepository(executor)
      const client = await identity.findClientAccount(input.clientAccountId)
      if (!client) throw new Error('Client account not found.')
      if (client.isPlaceholder) throw new Error('Select a real client account for new managed sites.')
      const audit = new AuditService(new AuditRepository(executor))
      const site = await new SiteService(new SiteRepository(executor), audit).create(input)
      await identity.assignSiteToClient(site.id, client.id, input.actorIdentifier ?? 'dashboard-user', site.createdAt)
      await new EntitlementService(executor).assignInitialPlan(
        site.id,
        input.planId,
        input.actorIdentifier ?? 'dashboard-user',
        'Initial plan selected during site registration.',
        new Date(site.createdAt)
      )
      await audit.record({
        siteId: site.id,
        actorType: 'dashboard-user',
        actorIdentifier: input.actorIdentifier,
        eventType: 'site.client-assigned',
        metadata: { clientAccountId: client.id, initialAssignment: true }
      })
      return site
    })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
