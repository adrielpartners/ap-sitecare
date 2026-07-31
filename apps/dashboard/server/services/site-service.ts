import { randomUUID } from 'node:crypto'
import type { RiskLevel, Site } from '../domain/types'
import { SiteRepository } from '../repositories/site-repository'
import { AuditService } from './audit-service'

export interface CreateSiteInput {
  name: string
  url: string
  hostingProvider?: string | null
  backupStrategy?: string | null
  riskLevel?: RiskLevel
  notes?: string | null
  actorIdentifier?: string
}

export interface UpdateSiteInput {
  name?: string
  url?: string
  hostingProvider?: string | null
  backupStrategy?: string | null
  riskLevel?: RiskLevel
  notes?: string | null
}

function normalizeOptional(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function normalizeSiteUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export class SiteService {
  constructor(
    private readonly siteRepository = new SiteRepository(),
    private readonly auditService = new AuditService()
  ) {}

  async create(input: CreateSiteInput): Promise<Site> {
    const name = input.name.trim()
    if (!name) throw new Error('Site name is required.')

    const now = new Date().toISOString()
    const site = await this.siteRepository.create({
      id: randomUUID(),
      name,
      url: normalizeSiteUrl(input.url),
      status: 'active',
      hostingProvider: normalizeOptional(input.hostingProvider),
      backupStrategy: normalizeOptional(input.backupStrategy),
      riskLevel: input.riskLevel ?? 'standard',
      notes: normalizeOptional(input.notes),
      createdAt: now,
      updatedAt: now,
      disabledAt: null
    })

    await this.auditService.record({
      siteId: site.id,
      actorType: 'dashboard-user',
      actorIdentifier: input.actorIdentifier,
      eventType: 'site.created',
      metadata: { name: site.name, url: site.url }
    })
    return site
  }

  async get(id: string): Promise<Site> {
    const site = await this.siteRepository.findById(id)
    if (!site) throw new Error('Site not found.')
    return site
  }

  async list(siteIds: string[] | null = null): Promise<Site[]> {
    return siteIds === null ? this.siteRepository.list() : this.siteRepository.listByIds(siteIds)
  }

  async update(id: string, input: UpdateSiteInput, actorIdentifier?: string): Promise<Site> {
    const site = await this.get(id)
    const updated = await this.siteRepository.update({
      ...site,
      name: input.name?.trim() || site.name,
      url: input.url ? normalizeSiteUrl(input.url) : site.url,
      hostingProvider: input.hostingProvider === undefined ? site.hostingProvider : normalizeOptional(input.hostingProvider),
      backupStrategy: input.backupStrategy === undefined ? site.backupStrategy : normalizeOptional(input.backupStrategy),
      riskLevel: input.riskLevel ?? site.riskLevel,
      notes: input.notes === undefined ? site.notes : normalizeOptional(input.notes),
      updatedAt: new Date().toISOString()
    })
    await this.auditService.record({
      siteId: site.id,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'site.updated'
    })
    return updated
  }

  async disable(id: string, actorIdentifier?: string): Promise<Site> {
    const site = await this.get(id)
    const now = new Date().toISOString()
    const disabled = await this.siteRepository.update({
      ...site,
      status: 'disabled',
      disabledAt: now,
      updatedAt: now
    })
    await this.auditService.record({
      siteId: site.id,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'site.disabled'
    })
    return disabled
  }
}
