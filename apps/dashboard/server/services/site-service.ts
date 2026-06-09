import { randomUUID } from 'node:crypto'
import type { Site } from '../domain/types'
import { SiteRepository } from '../repositories/site-repository'
import { AuditService } from './audit-service'

export interface CreateSiteInput {
  name: string
  url: string
  actorIdentifier?: string
}

export interface UpdateSiteInput {
  name?: string
  url?: string
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

  create(input: CreateSiteInput): Site {
    const name = input.name.trim()
    if (!name) throw new Error('Site name is required.')

    const now = new Date().toISOString()
    const site = this.siteRepository.create({
      id: randomUUID(),
      name,
      url: normalizeSiteUrl(input.url),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      disabledAt: null
    })

    this.auditService.record({
      siteId: site.id,
      actorType: 'dashboard-user',
      actorIdentifier: input.actorIdentifier,
      eventType: 'site.created',
      metadata: { name: site.name, url: site.url }
    })
    return site
  }

  get(id: string): Site {
    const site = this.siteRepository.findById(id)
    if (!site) throw new Error('Site not found.')
    return site
  }

  list(): Site[] {
    return this.siteRepository.list()
  }

  update(id: string, input: UpdateSiteInput): Site {
    const site = this.get(id)
    const updated = this.siteRepository.update({
      ...site,
      name: input.name?.trim() || site.name,
      url: input.url ? normalizeSiteUrl(input.url) : site.url,
      updatedAt: new Date().toISOString()
    })
    this.auditService.record({ siteId: site.id, actorType: 'system', eventType: 'site.updated' })
    return updated
  }

  disable(id: string): Site {
    const site = this.get(id)
    const now = new Date().toISOString()
    const disabled = this.siteRepository.update({
      ...site,
      status: 'disabled',
      disabledAt: now,
      updatedAt: now
    })
    this.auditService.record({ siteId: site.id, actorType: 'system', eventType: 'site.disabled' })
    return disabled
  }
}
