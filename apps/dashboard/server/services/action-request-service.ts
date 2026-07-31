import { randomUUID } from 'node:crypto'
import type { ActionRequest, ActionRequestStatus } from '../domain/types'
import { ActionRequestRepository } from '../repositories/action-request-repository'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

export class ActionRequestService {
  constructor(
    private readonly repository = new ActionRequestRepository(),
    private readonly siteService = new SiteService(),
    private readonly auditService = new AuditService()
  ) {}

  async create(siteId: string, actionType: string, rationale: string, requestedBy: string): Promise<ActionRequest> {
    await this.siteService.get(siteId)
    if (!actionType.trim()) throw new Error('Action type is required.')
    if (!rationale.trim()) throw new Error('Rationale is required.')
    const request = await this.repository.create({
      id: randomUUID(),
      siteId,
      actionType: actionType.trim(),
      rationale: rationale.trim(),
      status: 'pending',
      requestedBy,
      reviewedBy: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null
    })
    await this.auditService.record({
      siteId,
      actorType: 'agent-or-dashboard-user',
      actorIdentifier: requestedBy,
      eventType: 'action-request.created',
      metadata: { actionRequestId: request.id, actionType: request.actionType }
    })
    return request
  }

  async list(siteIds: string[] | null = null): Promise<ActionRequest[]> {
    return siteIds === null ? this.repository.list() : this.repository.listScoped(siteIds)
  }

  async review(
    id: string,
    status: Exclude<ActionRequestStatus, 'pending'>,
    reviewedBy: string,
    note?: string,
    siteIds: string[] | null = null
  ): Promise<ActionRequest> {
    const request = await this.repository.findById(id)
    if (!request) throw new Error('Action request not found.')
    if (siteIds !== null && !siteIds.includes(request.siteId)) throw new Error('Action request not found.')
    if (request.status !== 'pending') throw new Error('Action request has already been reviewed.')
    const reviewed = await this.repository.update({
      ...request,
      status,
      reviewedBy,
      reviewNote: note?.trim() || null,
      reviewedAt: new Date().toISOString()
    })
    await this.auditService.record({
      siteId: request.siteId,
      actorType: 'dashboard-user',
      actorIdentifier: reviewedBy,
      eventType: `action-request.${status}`,
      metadata: { actionRequestId: request.id }
    })
    return reviewed
  }
}
