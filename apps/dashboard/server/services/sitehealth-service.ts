import { randomUUID } from 'node:crypto'
import {
  cleanupActionTypes,
  siteHealthAreas,
  type SiteHealthApproval,
  type SiteHealthApprovalStatus,
  type SiteHealthCheckup,
  type SiteHealthCheckupDetail,
  type SiteHealthCleanupProposal,
  type SiteHealthFinding,
  type SiteHealthRecommendation,
  type SiteHealthReview,
  type SiteHealthReviewContent
} from '../domain/sitehealth'
import { PageSpeedClient } from '../integrations/pagespeed-client'
import { AuditRepository } from '../repositories/audit-repository'
import { ServicePlanRepository } from '../repositories/service-plan-repository'
import { SiteRepository } from '../repositories/site-repository'
import { SiteHealthRepository } from '../repositories/sitehealth-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EntitlementService } from './entitlement-service'
import { NotificationService } from './notification-service'
import { SiteHealthEvidenceCollector } from './sitehealth-evidence-collector'

const approvalInstructions = 'Email us to confirm you want us to proceed with all recommendations. No cleanup work begins until your approval is received and recorded by the SiteCare team.'

export interface SiteHealthServiceSettings {
  sitecareBaseUrl: string
  pageSpeedApiKey: string
  pageSpeedApiBaseUrl: string
}

export class SiteHealthService {
  private readonly repository: SiteHealthRepository

  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase(),
    private readonly settings: SiteHealthServiceSettings = {
      sitecareBaseUrl: process.env.NUXT_SITECARE_BASE_URL ?? 'http://localhost:3000',
      pageSpeedApiKey: process.env.NUXT_INTEGRATIONS_PAGESPEED_API_KEY ?? '',
      pageSpeedApiBaseUrl: process.env.NUXT_INTEGRATIONS_PAGESPEED_API_BASE_URL ?? 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    },
    private readonly collector = new SiteHealthEvidenceCollector(
      database,
      new PageSpeedClient(settings.pageSpeedApiKey, fetch, settings.pageSpeedApiBaseUrl)
    )
  ) {
    this.repository = new SiteHealthRepository(database)
  }

  async requestManualCheckup(siteId: string, actorIdentifier: string, includeBrokenLinks = false): Promise<SiteHealthCheckup> {
    return this.requestCheckup(siteId, 'manual', actorIdentifier, 'dashboard-user', includeBrokenLinks, null)
  }

  async syncAnnualPolicies(at = new Date()): Promise<{ enabled: number, disabled: number }> {
    const subscriptions = await new ServicePlanRepository(this.database).listSubscriptions()
    let enabled = 0
    let disabled = 0
    for (const subscription of subscriptions) {
      const entitlements = await new EntitlementService(this.database).get(subscription.siteId, at)
      const existing = await this.repository.findAnnualPolicy(subscription.siteId)
      const active = entitlements.capabilities['annual-sitehealth-checkup'] && entitlements.operationalStatus === 'active'
      const now = at.toISOString()
      const latestAnnual = await this.repository.findLatestCompletedCheckup(subscription.siteId, 'annual')
      const firstDue = addDays(new Date(subscription.annualCheckupEligibleAt), 30).toISOString()
      const nextDue = latestAnnual?.completedAt
        ? addYears(new Date(latestAnnual.completedAt), 1).toISOString()
        : existing?.nextDueAt ?? firstDue
      await this.repository.saveAnnualPolicy({
        siteId: subscription.siteId,
        enabled: active,
        eligibleAt: subscription.annualCheckupEligibleAt,
        nextDueAt: active ? nextDue : existing?.nextDueAt ?? nextDue,
        lastCompletedAt: latestAnnual?.completedAt ?? existing?.lastCompletedAt ?? null,
        lastCheckupId: latestAnnual?.id ?? existing?.lastCheckupId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      if (active) enabled += 1
      else disabled += 1
    }
    return { enabled, disabled }
  }

  async planDueAnnualCheckups(at = new Date()): Promise<{ queued: string[], skipped: Array<{ siteId: string, reason: string }> }> {
    await this.syncAnnualPolicies(at)
    const due = await this.repository.listDueAnnualPolicies(at.toISOString())
    const queued: string[] = []
    const skipped: Array<{ siteId: string, reason: string }> = []
    for (const policy of due) {
      try {
        const entitlements = await new EntitlementService(this.database).get(policy.siteId, at)
        if (!entitlements.capabilities['annual-sitehealth-checkup'] || entitlements.operationalStatus !== 'active') {
          skipped.push({ siteId: policy.siteId, reason: 'annual-checkup-not-currently-entitled' })
          continue
        }
        const cycleDate = (policy.nextDueAt ?? at.toISOString()).slice(0, 10)
        const siteCheckups = await this.repository.listCheckups([policy.siteId], 500)
        const pendingAnnual = siteCheckups.find(checkup => checkup.triggerType === 'annual' && ['queued', 'running'].includes(checkup.status))
        if (pendingAnnual) {
          skipped.push({ siteId: policy.siteId, reason: `annual-cycle-already-${pendingAnnual.status}` })
          continue
        }
        const existingCycle = siteCheckups.find(checkup => checkup.triggerType === 'annual' && checkup.annualCycleDate?.slice(0, 10) === cycleDate)
        if (existingCycle) {
          skipped.push({ siteId: policy.siteId, reason: `annual-cycle-already-${existingCycle.status}` })
          continue
        }
        const checkup = await this.requestCheckup(policy.siteId, 'annual', 'system:sitehealth-scheduler', 'scheduler', false, cycleDate)
        queued.push(checkup.id)
      } catch (error) {
        skipped.push({ siteId: policy.siteId, reason: error instanceof Error ? error.message : 'planning-failed' })
      }
    }
    return { queued, skipped }
  }

  async runCheckup(checkupId: string): Promise<
    { checkupId: string, evidenceCount: number, findingCount: number, recommendationCount: number, reviewId: string }
    | { checkupId: string, skipped: true, reason: string }
  > {
    const checkup = await this.requiredCheckup(checkupId)
    if (checkup.status === 'draft-ready') {
      const review = (await this.repository.listReviewsForCheckup(checkup.id))[0]
      if (!review) throw new Error('Completed SiteHealth Checkup is missing its Review artifact.')
      return this.runResult(checkup, review)
    }
    if (checkup.status === 'cancelled') throw new Error('Cancelled SiteHealth Checkups cannot run.')
    if (checkup.triggerType === 'annual') {
      const entitlements = await new EntitlementService(this.database).get(checkup.siteId)
      if (!entitlements.capabilities['annual-sitehealth-checkup'] || entitlements.operationalStatus !== 'active') {
        const cancelledAt = new Date().toISOString()
        await this.withTransaction(async executor => {
          await new SiteHealthRepository(executor).updateCheckup({
            ...checkup, status: 'cancelled', completedAt: cancelledAt,
            errorMessage: 'Annual SiteHealth entitlement was unavailable at execution time.',
            updatedAt: cancelledAt
          })
          await new AuditService(new AuditRepository(executor)).record({
            siteId: checkup.siteId, actorType: 'automation-worker', actorIdentifier: 'system:sitehealth',
            eventType: 'sitehealth.checkup.cancelled-entitlement',
            metadata: { checkupId: checkup.id, operationalStatus: entitlements.operationalStatus }
          })
        })
        return { checkupId: checkup.id, skipped: true, reason: 'annual-sitehealth-checkup-not-entitled' }
      }
    }
    const site = await this.requiredSite(checkup.siteId)
    const startedAt = new Date().toISOString()
    await this.repository.updateCheckup({
      ...checkup, status: 'running', startedAt: checkup.startedAt ?? startedAt,
      completedAt: null, errorMessage: null, updatedAt: startedAt
    })
    try {
      const collected = await this.collector.collect({ ...checkup, status: 'running' }, site)
      await this.repository.replaceEvidence(checkup.id, collected.evidence)
      await this.repository.replaceAutomatedFindings(checkup.id, collected.findings)
      await this.repository.replaceAutomatedRecommendations(checkup.id, collected.recommendations)
      const review = await this.createOrRefreshDraft(checkup.id, 'system:sitehealth')
      const completedAt = new Date().toISOString()
      await this.repository.updateCheckup({
        ...checkup, status: 'draft-ready', startedAt: checkup.startedAt ?? startedAt,
        evidenceCheckInId: collected.evidenceCheckInId, completedAt,
        errorMessage: null, updatedAt: completedAt
      })
      if (checkup.triggerType === 'annual') {
        const policy = await this.repository.findAnnualPolicy(checkup.siteId)
        await this.repository.saveAnnualPolicy({
          siteId: checkup.siteId, enabled: policy?.enabled ?? true,
          eligibleAt: policy?.eligibleAt ?? checkup.annualCycleDate,
          nextDueAt: addYears(new Date(completedAt), 1).toISOString(),
          lastCompletedAt: completedAt, lastCheckupId: checkup.id,
          createdAt: policy?.createdAt ?? completedAt, updatedAt: completedAt
        })
        await new ServicePlanRepository(this.database).acknowledgePendingActivationIntents(
          checkup.siteId, ['annual-sitehealth-checkup'], completedAt
        )
      }
      await this.audit(checkup.siteId, 'automation-worker', 'system:sitehealth', 'sitehealth.checkup.completed', {
        checkupId: checkup.id, triggerType: checkup.triggerType,
        evidenceCount: collected.evidence.length, findingCount: collected.findings.length,
        recommendationCount: collected.recommendations.length, reviewId: review.id
      })
      return {
        checkupId: checkup.id, evidenceCount: collected.evidence.length,
        findingCount: collected.findings.length, recommendationCount: collected.recommendations.length,
        reviewId: review.id
      }
    } catch (error) {
      const failedAt = new Date().toISOString()
      await this.repository.updateCheckup({
        ...checkup, status: 'failed', startedAt: checkup.startedAt ?? startedAt,
        completedAt: failedAt, errorMessage: safeError(error), updatedAt: failedAt
      })
      throw error
    }
  }

  async list(siteIds: string[] | null = null): Promise<Array<SiteHealthCheckup & { site: { id: string, name: string, url: string }, latestReview: SiteHealthReview | null }>> {
    const checkups = await this.repository.listCheckups(siteIds)
    return Promise.all(checkups.map(async checkup => {
      const site = await this.requiredSite(checkup.siteId)
      return { ...checkup, site: { id: site.id, name: site.name, url: site.url }, latestReview: (await this.repository.listReviewsForCheckup(checkup.id))[0] ?? null }
    }))
  }

  async getCheckup(checkupId: string): Promise<SiteHealthCheckupDetail> {
    const checkup = await this.requiredCheckup(checkupId)
    const reviews = await this.repository.listReviewsForCheckup(checkupId)
    const approvals = (await Promise.all(reviews.map(review => this.repository.listApprovals(review.id)))).flat()
    const cleanupProposals = (await Promise.all(reviews.map(review => this.repository.listCleanupProposals(review.id)))).flat()
    return {
      checkup,
      evidence: await this.repository.listEvidence(checkupId),
      findings: await this.repository.listFindings(checkupId),
      recommendations: await this.repository.listRecommendations(checkupId),
      reviews, approvals, cleanupProposals
    }
  }

  async getSiteOverview(siteId: string) {
    await this.requiredSite(siteId)
    const checkups = (await this.repository.listCheckups([siteId], 50))
    return {
      annualPolicy: await this.repository.findAnnualPolicy(siteId),
      checkups: await Promise.all(checkups.map(async checkup => ({
        ...checkup,
        latestReview: (await this.repository.listReviewsForCheckup(checkup.id))[0] ?? null
      })))
    }
  }

  async saveFinding(checkupId: string, input: Partial<SiteHealthFinding> & Pick<SiteHealthFinding, 'title' | 'description' | 'area' | 'severity'>, actorIdentifier: string): Promise<SiteHealthFinding> {
    const checkup = await this.requiredEditableCheckup(checkupId)
    if (!siteHealthAreas.includes(input.area)) throw new Error('Unsupported SiteHealth area.')
    if (!['info', 'low', 'medium', 'high'].includes(input.severity)) throw new Error('Unsupported finding severity.')
    const existing = input.id ? (await this.repository.listFindings(checkupId)).find(item => item.id === input.id) : null
    if (input.id && !existing) throw new Error('SiteHealth finding not found.')
    const now = new Date().toISOString()
    const finding = await this.repository.saveFinding({
      id: existing?.id ?? randomUUID(), checkupId, siteId: checkup.siteId,
      evidenceId: existing?.evidenceId ?? input.evidenceId ?? null, area: input.area,
      title: requiredText(input.title, 'Finding title', 300),
      description: requiredText(input.description, 'Finding description', 5_000),
      severity: input.severity, origin: existing?.origin ?? 'technician',
      status: input.status ?? existing?.status ?? 'active',
      technicianNotes: optionalText(input.technicianNotes, 5_000),
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
      createdBy: existing?.createdBy ?? actorIdentifier,
      createdAt: existing?.createdAt ?? now, updatedAt: now
    })
    await this.createOrRefreshDraft(checkupId, actorIdentifier)
    await this.audit(checkup.siteId, 'dashboard-user', actorIdentifier, existing ? 'sitehealth.finding.updated' : 'sitehealth.finding.created', { checkupId, findingId: finding.id })
    return finding
  }

  async saveRecommendation(checkupId: string, input: Partial<SiteHealthRecommendation> & Pick<SiteHealthRecommendation, 'title' | 'description' | 'area' | 'priority' | 'actionType'>, actorIdentifier: string): Promise<SiteHealthRecommendation> {
    const checkup = await this.requiredEditableCheckup(checkupId)
    if (!siteHealthAreas.includes(input.area)) throw new Error('Unsupported SiteHealth area.')
    if (!cleanupActionTypes.includes(input.actionType)) throw new Error('Unsupported cleanup recommendation type.')
    if (!['low', 'medium', 'high'].includes(input.priority)) throw new Error('Unsupported recommendation priority.')
    const existing = input.id ? (await this.repository.listRecommendations(checkupId)).find(item => item.id === input.id) : null
    if (input.id && !existing) throw new Error('SiteHealth recommendation not found.')
    const now = new Date().toISOString()
    const recommendation = await this.repository.saveRecommendation({
      id: existing?.id ?? randomUUID(), checkupId, siteId: checkup.siteId,
      area: input.area, actionType: input.actionType,
      title: requiredText(input.title, 'Recommendation title', 300),
      description: requiredText(input.description, 'Recommendation description', 5_000),
      priority: input.priority, status: input.status ?? existing?.status ?? 'proposed',
      createdBy: existing?.createdBy ?? actorIdentifier,
      createdAt: existing?.createdAt ?? now, updatedAt: now
    })
    await this.createOrRefreshDraft(checkupId, actorIdentifier)
    await this.audit(checkup.siteId, 'dashboard-user', actorIdentifier, existing ? 'sitehealth.recommendation.updated' : 'sitehealth.recommendation.created', { checkupId, recommendationId: recommendation.id })
    return recommendation
  }

  async updateDraft(checkupId: string, input: { title?: string, executiveSummary?: string }, actorIdentifier: string): Promise<SiteHealthReview> {
    await this.requiredEditableCheckup(checkupId)
    const review = await this.createOrRefreshDraft(checkupId, actorIdentifier)
    const now = new Date().toISOString()
    const updated = await this.repository.updateReview({
      ...review,
      title: input.title === undefined ? review.title : requiredText(input.title, 'Review title', 300),
      executiveSummary: input.executiveSummary === undefined ? review.executiveSummary : requiredText(input.executiveSummary, 'Executive summary', 10_000),
      updatedAt: now
    })
    await this.audit(review.siteId, 'dashboard-user', actorIdentifier, 'sitehealth.review.draft-updated', { checkupId, reviewId: review.id })
    return updated
  }

  async publish(checkupId: string, actorIdentifier: string): Promise<SiteHealthReview> {
    const checkup = await this.requiredEditableCheckup(checkupId)
    const site = await this.requiredSite(checkup.siteId)
    const drafts = await this.repository.listReviewsForCheckup(checkupId)
    const draft = drafts.find(review => review.status === 'draft') ?? await this.createOrRefreshDraft(checkupId, actorIdentifier)
    const now = new Date().toISOString()
    const content = await this.buildReviewContent(checkupId, site)
    return this.withTransaction(async executor => {
      const repository = new SiteHealthRepository(executor)
      const published = await repository.updateReview({
        ...draft, status: 'published', content,
        publishedBy: actorIdentifier, publishedAt: now, sentAt: null, updatedAt: now
      })
      await repository.supersedePublishedReviews(checkupId, published.id, now)
      await new AuditService(new AuditRepository(executor)).record({
        siteId: checkup.siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'sitehealth.review.published',
        metadata: { checkupId, reviewId: published.id, version: published.version }
      })
      return published
    })
  }

  async sendReview(reviewId: string, actorIdentifier: string): Promise<{ review: SiteHealthReview, recipientCount: number, messageIds: string[] }> {
    const review = await this.requiredReview(reviewId)
    if (!['published', 'sent'].includes(review.status)) throw new Error('Publish the SiteHealth Review before sending it.')
    const site = await this.requiredSite(review.siteId)
    const url = `${this.settings.sitecareBaseUrl.replace(/\/$/, '')}/reports/${encodeURIComponent(review.id)}`
    const recommendations = review.content.recommendations.filter(item => item.status === 'proposed')
    return this.withTransaction(async executor => {
      const result = await new NotificationService(executor).enqueueForSite(
        review.siteId, 'sitehealth', `sitehealth-review:${review.id}:v${review.version}`,
        {
          subject: `${site.name} SiteHealth Review`,
          textContent: renderTextReview(review, site, url),
          htmlContent: renderHtmlReview(review, site, url, recommendations)
        },
        {
          messageType: 'sitehealth-review', templateKey: 'sitehealth-review-v1',
          artifactReference: review.id,
          metadata: { reviewId: review.id, checkupId: review.checkupId, version: review.version }
        }
      )
      if (result.recipientCount === 0) throw new Error('Configure at least one enabled SiteHealth email recipient before sending this Review.')
      const sentAt = new Date().toISOString()
      const updated = await new SiteHealthRepository(executor).updateReview({ ...review, status: 'sent', sentAt, updatedAt: sentAt })
      await new AuditService(new AuditRepository(executor)).record({
        siteId: review.siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'sitehealth.review.email-queued',
        metadata: { reviewId, recipientCount: result.recipientCount, messageIds: result.messageIds }
      })
      return { review: updated, ...result }
    })
  }

  async getPublishedReview(reviewId: string): Promise<SiteHealthReview> {
    const review = await this.requiredReview(reviewId)
    if (!['published', 'sent', 'superseded'].includes(review.status)) throw new Error('SiteHealth Review is not published.')
    return review
  }

  async listPublishedReviews(siteIds: string[] | null): Promise<SiteHealthReview[]> {
    return this.repository.listPublishedReviews(siteIds)
  }

  async getClientPublishedReview(reviewId: string): Promise<SiteHealthReview> {
    return toClientSafeReview(await this.getPublishedReview(reviewId))
  }

  async listClientPublishedReviews(siteIds: string[] | null): Promise<SiteHealthReview[]> {
    return (await this.listPublishedReviews(siteIds)).map(toClientSafeReview)
  }

  async recordApproval(reviewId: string, input: { status: SiteHealthApprovalStatus, source: SiteHealthApproval['source'], notes: string }, actorIdentifier: string): Promise<{ approval: SiteHealthApproval, cleanupProposals: SiteHealthCleanupProposal[] }> {
    const review = await this.requiredReview(reviewId)
    if (!['published', 'sent'].includes(review.status)) throw new Error('Approval can only be recorded against the current published SiteHealth Review.')
    if (!['approved-all', 'declined', 'partial'].includes(input.status)) throw new Error('Unsupported approval status.')
    if (!['external-email', 'phone', 'other'].includes(input.source)) throw new Error('Unsupported approval source.')
    return this.withTransaction(async executor => {
      const repository = new SiteHealthRepository(executor)
      const now = new Date().toISOString()
      const approval = await repository.createApproval({
        id: randomUUID(), reviewId, siteId: review.siteId, status: input.status,
        source: input.source, notes: requiredText(input.notes, 'Approval notes', 5_000),
        recordedBy: actorIdentifier, recordedAt: now
      })
      const cleanupProposals: SiteHealthCleanupProposal[] = []
      if (approval.status === 'approved-all') {
        for (const recommendation of review.content.recommendations.filter(item => item.status === 'proposed')) {
          cleanupProposals.push(await repository.saveCleanupProposal({
            id: randomUUID(), reviewId, recommendationId: recommendation.id,
            siteId: review.siteId, actionType: recommendation.actionType,
            status: 'approved', approvalId: approval.id, technicianNotes: null,
            initiatedBy: null, initiatedAt: null, completedAt: null,
            createdAt: now, updatedAt: now
          }))
        }
      }
      await new AuditService(new AuditRepository(executor)).record({
        siteId: review.siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'sitehealth.approval.recorded',
        metadata: { reviewId, approvalId: approval.id, status: approval.status, cleanupProposalCount: cleanupProposals.length }
      })
      return { approval, cleanupProposals }
    })
  }

  async initiateCleanupProposal(proposalId: string, notes: string | null, actorIdentifier: string): Promise<SiteHealthCleanupProposal> {
    const proposal = await this.repository.findCleanupProposal(proposalId)
    if (!proposal) throw new Error('Cleanup proposal not found.')
    if (proposal.status !== 'approved' || !proposal.approvalId) throw new Error('Explicit client approval must be recorded before cleanup can be initiated.')
    return this.withTransaction(async executor => {
      const now = new Date().toISOString()
      const updated = await new SiteHealthRepository(executor).saveCleanupProposal({
        ...proposal, status: 'initiated', technicianNotes: optionalText(notes, 5_000),
        initiatedBy: actorIdentifier, initiatedAt: now, updatedAt: now
      })
      await new AuditService(new AuditRepository(executor)).record({
        siteId: proposal.siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'sitehealth.cleanup.initiated-manually',
        metadata: { proposalId, reviewId: proposal.reviewId, actionType: proposal.actionType, executor: 'none' }
      })
      return updated
    })
  }

  async getCleanupProposal(proposalId: string): Promise<SiteHealthCleanupProposal> {
    const proposal = await this.repository.findCleanupProposal(proposalId)
    if (!proposal) throw new Error('Cleanup proposal not found.')
    return proposal
  }

  private async requestCheckup(
    siteId: string,
    triggerType: SiteHealthCheckup['triggerType'],
    actorIdentifier: string,
    actorType: string,
    includeBrokenLinks: boolean,
    annualCycleDate: string | null
  ): Promise<SiteHealthCheckup> {
    await this.requiredSite(siteId)
    if (triggerType === 'annual') await new EntitlementService(this.database).assertCapability(siteId, 'annual-sitehealth-checkup')
    return this.withTransaction(async executor => {
      const repository = new SiteHealthRepository(executor)
      const now = new Date().toISOString()
      const created = await repository.createCheckup({
        id: randomUUID(), siteId, triggerType, annualCycleDate, status: 'queued',
        includeBrokenLinks, requestedByType: actorType, requestedBy: actorIdentifier,
        automationJobId: null, evidenceCheckInId: null, startedAt: null,
        completedAt: null, errorMessage: null, createdAt: now, updatedAt: now
      })
      if (created.automationJobId) return created
      const { AutomationService } = await import('./automation-service')
      const queued = await new AutomationService(executor).enqueue({
        siteId, jobType: 'sitehealth.checkup.collect', operationKey: 'sitehealth-checkup',
        payload: { checkupId: created.id }, idempotencyKey: `sitehealth-checkup:${created.id}`,
        requestedByType: actorType, requestedBy: actorIdentifier, maxAttempts: 3
      })
      const updated = await repository.updateCheckup({ ...created, automationJobId: queued.job.id, updatedAt: now })
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType, actorIdentifier, eventType: 'sitehealth.checkup.queued',
        metadata: { checkupId: updated.id, triggerType, automationJobId: queued.job.id, includeBrokenLinks }
      })
      return updated
    })
  }

  private async createOrRefreshDraft(checkupId: string, actorIdentifier: string): Promise<SiteHealthReview> {
    const checkup = await this.requiredCheckup(checkupId)
    const site = await this.requiredSite(checkup.siteId)
    const reviews = await this.repository.listReviewsForCheckup(checkupId)
    const existing = reviews.find(review => review.status === 'draft')
    const previous = reviews.find(review => review.status !== 'draft')
    const content = await this.buildReviewContent(checkupId, site)
    const now = new Date().toISOString()
    const summary = defaultSummary(content)
    if (existing) return this.repository.updateReview({ ...existing, executiveSummary: existing.executiveSummary || summary, content, updatedAt: now })
    return this.repository.createReview({
      id: randomUUID(), checkupId, siteId: checkup.siteId,
      version: await this.repository.nextReviewVersion(checkupId), status: 'draft',
      title: previous?.title ?? `${site.name} SiteHealth Review`,
      executiveSummary: previous?.executiveSummary ?? summary,
      content, createdBy: actorIdentifier, publishedBy: null, publishedAt: null,
      sentAt: null, createdAt: now, updatedAt: now
    })
  }

  private async buildReviewContent(checkupId: string, site: { id: string, name: string, url: string }): Promise<SiteHealthReviewContent> {
    return {
      generatedAt: new Date().toISOString(), site,
      evidence: await this.repository.listEvidence(checkupId),
      findings: (await this.repository.listFindings(checkupId)).filter(item => item.status === 'active'),
      recommendations: (await this.repository.listRecommendations(checkupId)).filter(item => item.status === 'proposed'),
      approvalInstructions
    }
  }

  private runResult(checkup: SiteHealthCheckup, review: SiteHealthReview) {
    return {
      checkupId: checkup.id,
      evidenceCount: review.content.evidence.length,
      findingCount: review.content.findings.length,
      recommendationCount: review.content.recommendations.length,
      reviewId: review.id
    }
  }

  private async requiredEditableCheckup(checkupId: string): Promise<SiteHealthCheckup> {
    const checkup = await this.requiredCheckup(checkupId)
    if (checkup.status !== 'draft-ready') throw new Error('The SiteHealth Checkup must finish before technician review.')
    return checkup
  }

  private async requiredCheckup(checkupId: string): Promise<SiteHealthCheckup> {
    const checkup = await this.repository.findCheckup(checkupId)
    if (!checkup) throw new Error('SiteHealth Checkup not found.')
    return checkup
  }

  private async requiredReview(reviewId: string): Promise<SiteHealthReview> {
    const review = await this.repository.findReview(reviewId)
    if (!review) throw new Error('SiteHealth Review not found.')
    return review
  }

  private async requiredSite(siteId: string) {
    const site = await new SiteRepository(this.database).findById(siteId)
    if (!site) throw new Error('Site not found.')
    return site
  }

  private async audit(siteId: string, actorType: string, actorIdentifier: string, eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await new AuditService(new AuditRepository(this.database)).record({ siteId, actorType, actorIdentifier, eventType, metadata })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

function defaultSummary(content: SiteHealthReviewContent): string {
  const high = content.findings.filter(item => item.severity === 'high').length
  const unavailable = content.evidence.filter(item => item.availability !== 'available').length
  return `${content.findings.length} findings and ${content.recommendations.length} recommendations were assembled for technician review.${high ? ` ${high} high-priority findings need attention.` : ''}${unavailable ? ` ${unavailable} evidence items were unavailable or returned an error and are identified in the Review.` : ''}`
}

function renderTextReview(review: SiteHealthReview, site: { name: string, url: string }, url: string): string {
  const findings = review.content.findings.filter(item => item.status === 'active')
  const recommendations = review.content.recommendations.filter(item => item.status === 'proposed')
  return [
    `${site.name} SiteHealth Review`, site.url, '', review.executiveSummary, '',
    'Findings:',
    ...(findings.length ? findings.map(item => `- ${item.title}: ${item.description}`) : ['- No active findings.']),
    '',
    'Recommendations:',
    ...(recommendations.length ? recommendations.map(item => `- ${item.title}: ${item.description}`) : ['- No maintenance recommendations at this time.']),
    '', 'Evidence availability:',
    ...review.content.evidence.map(item => `- ${item.area} / ${item.source}: ${item.availability} — ${item.summary}`),
    '', approvalInstructions, '', `View the complete Review: ${url}`
  ].join('\n')
}

function renderHtmlReview(review: SiteHealthReview, site: { name: string, url: string }, url: string, recommendations: SiteHealthRecommendation[]): string {
  const findingItems = review.content.findings.length
    ? review.content.findings.map(item => `<li><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.description)}</li>`).join('')
    : '<li>No active findings.</li>'
  const recommendationItems = recommendations.length
    ? recommendations.map(item => `<li><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.description)}</li>`).join('')
    : '<li>No maintenance recommendations at this time.</li>'
  const evidenceItems = review.content.evidence
    .map(item => `<li><strong>${escapeHtml(item.area)} / ${escapeHtml(item.source)}:</strong> ${escapeHtml(item.availability)} — ${escapeHtml(item.summary)}</li>`)
    .join('')
  return `<h1>${escapeHtml(site.name)} SiteHealth Review</h1><p><a href="${escapeHtml(site.url)}">${escapeHtml(site.url)}</a></p><p>${escapeHtml(review.executiveSummary)}</p><h2>Findings</h2><ul>${findingItems}</ul><h2>Recommendations</h2><ul>${recommendationItems}</ul><h2>Evidence availability</h2><ul>${evidenceItems}</ul><p><strong>${escapeHtml(approvalInstructions)}</strong></p><p><a href="${escapeHtml(url)}">View the SiteHealth Review in the Dashboard</a></p>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  if (value.trim().length > maximum) throw new Error(`${label} is too long.`)
  return value.trim()
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('Text value is invalid.')
  return value.trim().slice(0, maximum) || null
}

function addDays(date: Date, days: number): Date { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result }
function addYears(date: Date, years: number): Date { const result = new Date(date); result.setUTCFullYear(result.getUTCFullYear() + years); return result }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : 'SiteHealth Checkup failed.').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 1_000) }

function toClientSafeReview(review: SiteHealthReview): SiteHealthReview {
  return {
    ...review,
    createdBy: 'SiteCare team',
    publishedBy: null,
    content: {
      ...review.content,
      evidence: review.content.evidence.map(item => ({ ...item, value: {} })),
      findings: review.content.findings.map(item => ({
        ...item,
        technicianNotes: null,
        createdBy: 'SiteCare team'
      })),
      recommendations: review.content.recommendations.map(item => ({
        ...item,
        createdBy: 'SiteCare team'
      }))
    }
  }
}
