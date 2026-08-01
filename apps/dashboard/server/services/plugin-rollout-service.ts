import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PluginUpdateRollout, PluginUpdateTarget, SiteRecoveryEvidence } from '../domain/plugin-update'
import { BackupRepository } from '../repositories/backup-repository'
import { PluginUpdateRepository } from '../repositories/plugin-update-repository'
import { ServicePlanRepository } from '../repositories/service-plan-repository'
import { SiteRepository } from '../repositories/site-repository'
import { WordPressUpdateRepository } from '../repositories/wordpress-update-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { ActionRequestService } from './action-request-service'
import { AuditService } from './audit-service'
import { AutomationService } from './automation-service'
import { CredentialService } from './credential-service'
import { MfaService } from './mfa-service'
import { NotificationService } from './notification-service'
import { WordPressConnectorService } from './wordpress-connector-service'
import { AuditRepository } from '../repositories/audit-repository'
import { ActionRequestRepository } from '../repositories/action-request-repository'
import { SiteService } from './site-service'
import { WordPressUpdateService } from './wordpress-update-service'
import { logOperationalEvent, safeOperationalError } from '../utils/structured-logger'

export interface PluginRolloutSettings {
  sitecareBaseUrl: string
  credentialEncryptionKey: string
}

export class PluginRolloutService {
  constructor(
    private readonly settings: PluginRolloutSettings,
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase(),
    private readonly repository = new PluginUpdateRepository(database),
    private readonly audit = new AuditService(new AuditRepository(database)),
    private readonly connector = new WordPressConnectorService(
      new CredentialService(settings.credentialEncryptionKey, new SiteRepository(database), audit),
      new SiteService(new SiteRepository(database), audit),
      new WordPressUpdateService(
        new WordPressUpdateRepository(database),
        new SiteService(new SiteRepository(database), audit),
        audit
      )
    )
  ) {}

  async create(packageId: string, actor: string, options: { canarySize?: number, failureThreshold?: number, concurrencyLimit?: number } = {}) {
    const packageValue = await this.repository.findPackage(packageId)
    if (!packageValue || packageValue.validationStatus !== 'validated') throw new Error('Validated plugin package not found.')
    const canarySize = bounded(options.canarySize, 1, 20, 1)
    const failureThreshold = bounded(options.failureThreshold, 1, canarySize, 1)
    const rolloutId = randomUUID()
    const now = new Date().toISOString()
    const sites = await new SiteRepository(this.database).list()
    const updates = new WordPressUpdateRepository(this.database)
    const credentials = new CredentialService(this.settings.credentialEncryptionKey, new SiteRepository(this.database), this.audit)
    const targets: PluginUpdateTarget[] = []
    for (const site of sites) {
      const snapshot = await updates.findLatestSnapshot(site.id)
      const inventory = snapshot ? await updates.listInventory(snapshot.id) : []
      const installed = inventory.find(item => item.componentType === 'plugin' && item.slug === packageValue.pluginSlug)
      const connection = await credentials.getConnectionSummary(site.id)
      const recovery = await this.recoveryEvidence(site.id, now)
      let category: PluginUpdateTarget['category'] = 'eligible'
      let message: string | null = null
      if (site.status !== 'active') [category, message] = ['suspended', 'Site is disabled.']
      else if (!connection.activeCredential || !connection.connection) [category, message] = ['disconnected', 'WordPress connector is not connected.']
      else if (connection.connection.contractVersion < 4) [category, message] = ['incompatible', 'WordPress connector contract 4 is required.']
      else if (!installed) [category, message] = ['not-installed', 'Plugin is not reported as installed.']
      else if (compareVersions(installed.installedVersion, packageValue.version) >= 0) [category, message] = ['current', 'Installed version is already current or newer.']
      else if (!recovery) [category, message] = ['recovery-required', 'Verified recovery evidence is required before rollout.']
      const selected = Boolean(installed && compareVersions(installed.installedVersion, packageValue.version) < 0)
      targets.push({
        id: randomUUID(), rolloutId, siteId: site.id,
        pluginFile: typeof installed?.metadata.pluginFile === 'string' ? installed.metadata.pluginFile : null,
        installedVersion: installed?.installedVersion ?? null, targetVersion: packageValue.version,
        resultingVersion: null, category, selected, recoveryReady: Boolean(recovery),
        recoveryEvidenceId: recovery?.id ?? null, preflightStatus: category === 'eligible' ? 'passed' : 'blocked',
        preflightMessage: message, batchNumber: null, status: 'pending', automationJobId: null,
        attemptCount: 0, startedAt: null, completedAt: null, errorCode: null,
        errorMessage: null, response: {}, createdAt: now, updatedAt: now
      })
    }
    const installedTarget = targets.find(target => target.installedVersion)
    if (!installedTarget) throw new Error('No managed site reports this plugin as installed.')
    const action = await this.actionRequests().create(
      installedTarget.siteId,
      'central-plugin-rollout',
      `Deploy ${packageValue.pluginName} ${packageValue.version} using rollout ${rolloutId}.`,
      actor
    )
    const rollout: PluginUpdateRollout = {
      id: rolloutId, packageId, actionRequestId: action.id, status: 'draft',
      canarySize,
      failureThreshold,
      concurrencyLimit: bounded(options.concurrencyLimit, 1, 20, 2),
      haltReason: null, createdBy: actor, confirmedBy: null, confirmedAt: null,
      startedAt: null, completedAt: null, createdAt: now, updatedAt: now
    }
    await this.repository.createRollout(rollout, targets)
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: actor, eventType: 'plugin-rollout.created', metadata: { rolloutId, packageId, discoveredTargets: targets.length, selectedTargets: targets.filter(target => target.selected).length, actionRequestId: action.id } })
    return (await this.repository.detail(rolloutId))!
  }

  async list() { return this.repository.listRollouts() }

  async get(id: string) {
    const value = await this.repository.detail(id)
    if (!value) throw new Error('Plugin rollout not found.')
    return value
  }

  async select(id: string, targetIds: string[], actor: string) {
    const detail = await this.get(id)
    if (detail.rollout.status !== 'draft') throw new Error('Only draft rollouts can be edited.')
    const known = new Set(detail.targets.map(target => target.id))
    if (targetIds.some(targetId => !known.has(targetId))) throw new Error('A selected rollout target is invalid.')
    await this.repository.updateSelection(id, [...new Set(targetIds)], new Date().toISOString())
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: actor, eventType: 'plugin-rollout.selection-updated', metadata: { rolloutId: id, selectedTargetIds: targetIds } })
    return this.get(id)
  }

  async confirm(id: string, actor: { userId: string, email: string }, mfaCode: string) {
    const detail = await this.get(id)
    if (detail.rollout.status !== 'draft') throw new Error('The rollout is no longer awaiting confirmation.')
    const selected = detail.targets.filter(target => target.selected)
    if (!selected.length) throw new Error('Select at least one site for the rollout.')
    const blocked = selected.filter(target => target.category !== 'eligible' || !target.recoveryReady || !target.pluginFile || !target.installedVersion)
    if (blocked.length) throw new Error(`${blocked.length} selected site(s) failed preflight. Resolve or deselect them before approval.`)
    for (const target of selected) {
      const evidence = target.recoveryEvidenceId ? await this.repository.findEvidence(target.recoveryEvidenceId) : null
      if (!evidence || Date.parse(evidence.validUntil) < Date.now()) {
        throw new Error(`Recovery evidence expired for site ${target.siteId}. Rediscover targets after recording current evidence.`)
      }
    }
    await new MfaService(this.settings.credentialEncryptionKey, this.database, this.audit).verifyStepUp(actor.userId, mfaCode)
    if (!detail.rollout.actionRequestId) throw new Error('The rollout does not have an Action Request.')
    await this.actionRequests().review(detail.rollout.actionRequestId, 'approved', actor.email, 'Approved with administrator MFA step-up for canary rollout.')
    const at = new Date().toISOString()
    const prepared = await this.repository.prepareBatches(id, detail.rollout.canarySize, at)
    await this.repository.approveRollout(id, actor.email, at)
    for (const target of prepared.filter(value => value.batchNumber === 0 && value.preflightStatus === 'passed')) {
      await this.enqueueTarget(target, actor.email)
    }
    await this.audit.record({ actorType: 'dashboard-user', actorIdentifier: actor.email, eventType: 'plugin-rollout.confirmed', metadata: { rolloutId: id, canarySize: detail.rollout.canarySize, selectedCount: selected.length } })
    return this.get(id)
  }

  async retryTarget(rolloutId: string, targetId: string, actor: string) {
    const detail = await this.get(rolloutId)
    if (!['paused', 'running', 'failed'].includes(detail.rollout.status)) throw new Error('This rollout is not accepting retries.')
    const target = detail.targets.find(value => value.id === targetId)
    if (!target || !['failed', 'needs-attention'].includes(target.status)) throw new Error('Only failed rollout targets can be retried.')
    await this.enqueueTarget(target, actor, true)
    await this.repository.setRolloutState(rolloutId, target.batchNumber === 0 ? 'canary-running' : 'running', null, new Date().toISOString())
    return this.get(rolloutId)
  }

  async executeTarget(targetId: string): Promise<Record<string, unknown>> {
    const target = await this.repository.findTarget(targetId)
    if (!target) throw new Error('Plugin rollout target not found.')
    const rollout = await this.repository.findRollout(target.rolloutId)
    if (!rollout || !['canary-running', 'running'].includes(rollout.status)) throw new Error('Plugin rollout is not running.')
    const active = (await this.repository.listTargets(rollout.id)).filter(value => value.status === 'running').length
    if (active >= rollout.concurrencyLimit) throw new Error('Rollout concurrency limit is currently reached.')
    const packageValue = await this.repository.findPackage(rollout.packageId)
    if (!packageValue || !target.pluginFile || !target.installedVersion) throw new Error('Plugin rollout execution evidence is incomplete.')
    await this.repository.setTargetRunning(target.id, new Date().toISOString())
    const token = randomBytes(32).toString('base64url')
    const createdAt = new Date().toISOString()
    await this.repository.saveDownloadToken({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      packageId: packageValue.id, targetId: target.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), createdAt
    })
    try {
      const result = await this.connector.requestPluginUpdate(target.siteId, {
        requestId: randomUUID(), pluginSlug: packageValue.pluginSlug,
        pluginFile: target.pluginFile, installedVersion: target.installedVersion,
        targetVersion: packageValue.version,
        packageUrl: `${this.settings.sitecareBaseUrl.replace(/\/$/, '')}/api/plugin/package-download/${token}`,
        checksumSha256: packageValue.checksumSha256
      })
      const at = new Date().toISOString()
      await this.repository.finishTarget(target.id, { status: 'succeeded', resultingVersion: result.resultingVersion, response: result }, at)
      await this.audit.record({ siteId: target.siteId, actorType: 'automation-worker', eventType: 'plugin-rollout.target-succeeded', metadata: { rolloutId: rollout.id, targetId: target.id, beforeVersion: target.installedVersion, targetVersion: target.targetVersion, resultingVersion: result.resultingVersion } })
      await this.notifyTargetSafely(target.siteId, rollout.id, packageValue.pluginName, true, null)
      await this.evaluateRollout(rollout.id)
      return { succeeded: true, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plugin update failed.'
      const at = new Date().toISOString()
      await this.repository.finishTarget(target.id, { status: 'failed', errorCode: 'remote-update-failed', errorMessage: message }, at)
      await this.audit.record({ siteId: target.siteId, actorType: 'automation-worker', eventType: 'plugin-rollout.target-failed', metadata: { rolloutId: rollout.id, targetId: target.id, errorCode: 'remote-update-failed', errorMessage: message } })
      await this.notifyTargetSafely(target.siteId, rollout.id, packageValue.pluginName, false, message)
      await this.evaluateRollout(rollout.id)
      return { succeeded: false, errorCode: 'remote-update-failed', errorMessage: message }
    }
  }

  async claimPackage(token: string): Promise<{ buffer: Buffer, filename: string, checksumSha256: string } | null> {
    const claimed = await this.repository.claimDownloadToken(createHash('sha256').update(token).digest('hex'), new Date().toISOString())
    if (!claimed) return null
    const packageValue = await this.repository.findPackage(claimed.packageId)
    const target = await this.repository.findTarget(claimed.targetId)
    if (!packageValue || !target) return null
    const buffer = await readFile(packageValue.storagePath)
    if (createHash('sha256').update(buffer).digest('hex') !== packageValue.checksumSha256) throw new Error('Stored plugin package checksum verification failed.')
    return { buffer, filename: `${packageValue.pluginSlug}-${packageValue.version}.zip`, checksumSha256: packageValue.checksumSha256 }
  }

  async recordRecoveryEvidence(siteId: string, input: { backupReference: string, backupCompletedAt: string, validUntil: string, notes?: string }, actor: string): Promise<SiteRecoveryEvidence> {
    if (!input.backupReference.trim()) throw new Error('Backup reference is required.')
    if (!Number.isFinite(Date.parse(input.backupCompletedAt)) || !Number.isFinite(Date.parse(input.validUntil))) throw new Error('Recovery evidence dates are invalid.')
    const backupCompletedAt = Date.parse(input.backupCompletedAt)
    const validUntil = Date.parse(input.validUntil)
    if (backupCompletedAt > Date.now() + 5 * 60_000) throw new Error('Backup completion cannot be in the future.')
    if (validUntil <= Date.now()) throw new Error('Recovery evidence must remain valid into the future.')
    if (validUntil > backupCompletedAt + 30 * 24 * 60 * 60_000) {
      throw new Error('Hostinger recovery evidence cannot outlive the 30-day backup retention window.')
    }
    const value = await this.repository.saveEvidence({
      id: randomUUID(), siteId, source: 'hostinger-technician-confirmed',
      backupReference: input.backupReference.trim().slice(0, 500),
      backupCompletedAt: new Date(backupCompletedAt).toISOString(),
      validUntil: new Date(validUntil).toISOString(), notes: input.notes?.trim().slice(0, 1_000) || null,
      confirmedBy: actor, createdAt: new Date().toISOString()
    })
    await this.audit.record({ siteId, actorType: 'dashboard-user', actorIdentifier: actor, eventType: 'recovery-evidence.confirmed', metadata: { evidenceId: value.id, source: value.source, backupReference: value.backupReference, validUntil: value.validUntil } })
    return value
  }

  private async recoveryEvidence(siteId: string, at: string): Promise<SiteRecoveryEvidence | null> {
    const explicit = await this.repository.latestValidEvidence(siteId, at)
    if (explicit) return explicit
    const subscription = await new ServicePlanRepository(this.database).findSubscription(siteId)
    if (subscription?.planId !== 'sitecare-pro' || subscription.status !== 'active') return null
    const artifact = (await new BackupRepository(this.database).listArtifacts(siteId))
      .find(value => value.status === 'completed' && value.checksumVerifiedAt && value.uploadVerifiedAt && value.completedAt)
    if (!artifact?.completedAt) return null
    const evidence: SiteRecoveryEvidence = {
      id: randomUUID(), siteId, source: 'sitecare-backup', backupReference: artifact.id,
      backupCompletedAt: artifact.completedAt,
      validUntil: new Date(Date.parse(artifact.completedAt) + 35 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Automatically derived from a verified SiteCare backup artifact.',
      confirmedBy: 'system:sitecare-backup', createdAt: at
    }
    if (Date.parse(evidence.validUntil) < Date.parse(at)) return null
    return this.repository.saveEvidence(evidence)
  }

  private async enqueueTarget(target: PluginUpdateTarget, actor: string, retry = false): Promise<void> {
    const enqueued = await new AutomationService(this.database).enqueue({
      siteId: target.siteId, jobType: 'wordpress.plugin-update', operationKey: 'wordpress-plugin-update',
      payload: { targetId: target.id },
      idempotencyKey: retry ? `plugin-rollout:${target.id}:retry:${target.attemptCount + 1}` : `plugin-rollout:${target.id}`,
      requestedByType: 'dashboard-user', requestedBy: actor, maxAttempts: 1
    })
    await this.repository.setTargetQueued(target.id, enqueued.job.id, new Date().toISOString())
  }

  private async evaluateRollout(rolloutId: string): Promise<void> {
    const rollout = await this.repository.findRollout(rolloutId)
    if (!rollout) return
    const targets = (await this.repository.listTargets(rolloutId)).filter(target => target.selected)
    const canaries = targets.filter(target => target.batchNumber === 0)
    const canaryTerminal = canaries.length > 0 && canaries.every(target => ['succeeded', 'failed', 'needs-attention'].includes(target.status))
    const canaryFailures = canaries.filter(target => target.status !== 'succeeded').length
    const at = new Date().toISOString()
    if (rollout.status === 'canary-running' && canaryTerminal) {
      if (canaryFailures >= rollout.failureThreshold) {
        await this.repository.setRolloutState(rolloutId, 'paused', `Canary halt threshold reached (${canaryFailures} failure(s)).`, at)
        return
      }
      await this.repository.setRolloutState(rolloutId, 'running', null, at)
      for (const target of targets.filter(value => value.batchNumber === 1 && value.status === 'pending')) await this.enqueueTarget(target, 'system:canary-release')
    }
    const refreshed = (await this.repository.listTargets(rolloutId)).filter(target => target.selected)
    if (refreshed.length && refreshed.every(target => ['succeeded', 'failed', 'needs-attention'].includes(target.status))) {
      const failed = refreshed.filter(target => target.status !== 'succeeded').length
      await this.repository.setRolloutState(rolloutId, failed ? 'failed' : 'completed', failed ? `${failed} target(s) require attention.` : null, at)
    }
  }

  private async notifyTarget(siteId: string, rolloutId: string, pluginName: string, succeeded: boolean, error: string | null): Promise<void> {
    await new NotificationService(this.database).enqueueForSite(siteId, 'updates', `plugin-rollout:${rolloutId}:${siteId}:${succeeded ? 'succeeded' : 'failed'}`, {
      subject: `${succeeded ? 'Completed' : 'Failed'}: ${pluginName} plugin update`,
      textContent: succeeded ? `${pluginName} was updated successfully through AP SiteCare.` : `${pluginName} could not be updated. ${error ?? ''}`,
      htmlContent: `<p>${succeeded ? `${pluginName} was updated successfully through AP SiteCare.` : `${pluginName} could not be updated.`}</p>${error ? `<p>${escapeHtml(error)}</p>` : ''}`
    }, { messageType: succeeded ? 'plugin-update-succeeded' : 'plugin-update-failed', metadata: { rolloutId, pluginName, succeeded } })
  }

  private async notifyTargetSafely(siteId: string, rolloutId: string, pluginName: string, succeeded: boolean, error: string | null): Promise<void> {
    try {
      await this.notifyTarget(siteId, rolloutId, pluginName, succeeded, error)
    } catch (notificationError) {
      logOperationalEvent('error', 'plugin-rollout.notification-enqueue-failed', {
        siteId,
        rolloutId,
        succeeded,
        ...safeOperationalError(notificationError)
      })
    }
  }

  private actionRequests(): ActionRequestService {
    return new ActionRequestService(
      new ActionRequestRepository(this.database),
      new SiteService(new SiteRepository(this.database), this.audit),
      this.audit
    )
  }
}

export function compareVersions(left: string, right: string): number {
  const tokenize = (value: string) => value.replace(/^v/i, '').split(/[.+_-]/).map(part => /^\d+$/.test(part) ? Number(part) : part.toLowerCase())
  const a = tokenize(left)
  const b = tokenize(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? 0
    const y = b[index] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return 1
    if (typeof y === 'number') return -1
    return x < y ? -1 : 1
  }
  return 0
}

function bounded(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return Number.isInteger(value) && value! >= minimum && value! <= maximum ? value! : fallback
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
