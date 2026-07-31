import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  cloudflareSecurityControlDefinitions,
  type CloudflareSecurityControl,
  type CloudflareSecurityControlKey,
  type CloudflareSecurityEvidence,
  type CloudflareSecurityStatus,
  type CloudflareSiteConnection,
  type CloudflareSiteDetail,
  type UptimeIncident,
  type UptimeMonitorState,
  type UptimeObservation
} from '../domain/cloudflare'
import { CloudflareApiError, CloudflareClient, type CloudflareHealthCheck, type CloudflareSecurityApiSnapshot } from '../integrations/cloudflare-client'
import { AuditRepository } from '../repositories/audit-repository'
import { CloudflareRepository } from '../repositories/cloudflare-repository'
import { SiteRepository } from '../repositories/site-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { AuditService } from './audit-service'
import { EntitlementService } from './entitlement-service'
import { NotificationService } from './notification-service'

interface CloudflareEntitlementGate {
  get(siteId: string, at?: Date): ReturnType<EntitlementService['get']>
}

export interface UptimeObservationInput {
  status: 'healthy' | 'unhealthy' | 'unknown'
  observedAt: string
  reason?: string | null
  providerEventId: string
  source: UptimeObservation['source']
  metadata?: Record<string, unknown>
}

export interface CloudflareWebhookPayload {
  alert_type?: unknown
  alert_name?: unknown
  alert_id?: unknown
  alert_correlation_id?: unknown
  alert_event?: unknown
  data?: unknown
}

export interface CloudflareRuntimeOptions {
  accountId?: string
  webhookDestinationId?: string
  notificationPolicyId?: string
  webhookSecretConfigured?: boolean
}

export class CloudflareService {
  constructor(
    private readonly client: CloudflareClient,
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase(),
    private readonly entitlements: CloudflareEntitlementGate = new EntitlementService(database),
    private readonly runtime: CloudflareRuntimeOptions = {}
  ) {}

  async getSiteDetail(siteId: string): Promise<CloudflareSiteDetail & { observations: UptimeObservation[] }> {
    await this.requireSite(siteId)
    const repository = new CloudflareRepository(this.database)
    const [connection, monitor, incidents, observations, maintenanceWindows, checkedAt, evidence] = await Promise.all([
      repository.findConnection(siteId),
      repository.findMonitor(siteId),
      repository.listIncidents(siteId),
      repository.listObservations(siteId),
      repository.listMaintenance(siteId),
      repository.latestSecuritySyncAt(siteId),
      repository.listEffectiveSecurityEvidence(siteId)
    ])
    return {
      connection,
      monitor,
      incidents,
      observations,
      maintenanceWindows,
      security: { checkedAt, controls: effectiveControls(evidence) }
    }
  }

  async synchronizeSite(siteId: string, actorIdentifier = 'system:cloudflare'): Promise<CloudflareSiteConnection> {
    const site = await this.requireSite(siteId)
    const repository = new CloudflareRepository(this.database)
    const existing = await repository.findConnection(siteId)
    const now = new Date().toISOString()
    const entitlement = await this.entitlements.get(siteId)
    const normalIntervalSeconds = Math.max(60, (entitlement.settings.uptimeIntervalMinutes ?? 5) * 60)
    const threshold = entitlement.settings.uptimeAlertFailureThreshold ?? 2
    const base: CloudflareSiteConnection = {
      siteId,
      zoneId: existing?.zoneId ?? null,
      zoneName: existing?.zoneName ?? null,
      accountId: existing?.accountId ?? null,
      availability: this.client.configured() ? 'not-synchronized' : 'not-configured',
      homepageUrl: site.url,
      healthCheckId: existing?.healthCheckId ?? null,
      healthCheckName: existing?.healthCheckName ?? null,
      healthCheckStatus: existing?.healthCheckStatus ?? null,
      normalIntervalSeconds,
      alertFailureThreshold: threshold,
      capabilities: existing?.capabilities ?? {},
      lastSyncedAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    if (!this.client.configured()) return repository.saveConnection(base)

    try {
      const zone = await this.client.findZone(new URL(site.url).hostname)
      let notificationCapabilities: Record<string, unknown> = {
        webhookSecretConfigured: Boolean(this.runtime.webhookSecretConfigured)
      }
      const accountId = this.runtime.accountId || zone?.account?.id || ''
      if (zone && accountId) {
        try {
          notificationCapabilities = {
            ...notificationCapabilities,
            ...await this.client.notificationReadiness(
              accountId,
              this.runtime.webhookDestinationId ?? '',
              this.runtime.notificationPolicyId ?? ''
            )
          }
        } catch (error) {
          notificationCapabilities.notificationReadinessError = safeError(error)
        }
      }
      const saved = await repository.saveConnection({
        ...base,
        zoneId: zone?.id ?? null,
        zoneName: zone?.name ?? null,
        accountId: accountId || null,
        availability: zone ? 'available' : 'not-found',
        capabilities: { ...base.capabilities, zoneRead: 'available', notifications: notificationCapabilities }
      })
      await new AuditService(new AuditRepository(this.database)).record({
        siteId,
        actorType: actorIdentifier.startsWith('system:') ? 'system' : 'dashboard-user',
        actorIdentifier,
        eventType: 'cloudflare.site-synchronized',
        metadata: { availability: saved.availability, zoneId: saved.zoneId }
      })
      return saved
    } catch (error) {
      return repository.saveConnection({
        ...base,
        availability: 'provider-error',
        lastErrorCode: error instanceof CloudflareApiError ? String(error.code ?? error.status) : 'provider-error',
        lastErrorMessage: safeError(error)
      })
    }
  }

  async provisionUptime(siteId: string, actorIdentifier = 'system:cloudflare'): Promise<CloudflareSiteConnection> {
    const entitlement = await this.entitlements.get(siteId)
    if (!entitlement.capabilities['uptime-monitoring']) {
      await this.disableUptime(siteId)
      throw new Error(`${entitlement.underlyingPlan.name} does not currently include uptime monitoring for this site.`)
    }
    let connection = await this.synchronizeSite(siteId, actorIdentifier)
    if (connection.availability !== 'available' || !connection.zoneId) {
      throw new Error(connection.availability === 'not-configured'
        ? 'Configure a Cloudflare API token before provisioning uptime monitoring.'
        : 'A matching active Cloudflare zone is required before provisioning uptime monitoring.')
    }
    const url = new URL(connection.homepageUrl)
    const name = `sitecare-${siteId}`.slice(0, 63)
    let healthCheck: CloudflareHealthCheck | undefined
    if (connection.healthCheckId) {
      try {
        healthCheck = await this.client.getHealthCheck(connection.zoneId, connection.healthCheckId)
      } catch (error) {
        if (!(error instanceof CloudflareApiError && error.status === 404)) throw error
      }
    }
    if (!healthCheck) {
      const checks = await this.client.listHealthChecks(connection.zoneId)
      healthCheck = checks.find(check => check.name === name)
    }
    if (!healthCheck) {
      healthCheck = await this.client.createHealthCheck(connection.zoneId, {
        name,
        address: url.hostname,
        type: url.protocol === 'https:' ? 'HTTPS' : 'HTTP',
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        interval: connection.normalIntervalSeconds,
        consecutiveFails: 1,
        consecutiveSuccesses: 1,
        path: `${url.pathname}${url.search}` || '/'
      })
    } else {
      healthCheck = await this.client.updateHealthCheck(connection.zoneId, healthCheck.id, {
        interval: connection.normalIntervalSeconds,
        consecutiveFails: 1,
        consecutiveSuccesses: 1,
        suspended: false
      })
    }
    const now = new Date().toISOString()
    connection = await new CloudflareRepository(this.database).saveConnection({
      ...connection,
      healthCheckId: healthCheck.id,
      healthCheckName: healthCheck.name,
      healthCheckStatus: healthCheck.status,
      capabilities: { ...connection.capabilities, healthChecks: 'available' },
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: now
    })
    const repository = new CloudflareRepository(this.database)
    const existingMonitor = await repository.findMonitor(siteId)
    await repository.saveMonitor({
      ...newMonitor(siteId, connection.normalIntervalSeconds, now),
      ...existingMonitor,
      status: healthCheck.status === 'healthy' ? 'healthy' : existingMonitor?.status ?? 'not-configured',
      currentIntervalSeconds: healthCheck.interval,
      lastReconciledAt: now,
      updatedAt: now
    })
    await new AuditService(new AuditRepository(this.database)).record({
      siteId,
      actorType: actorIdentifier.startsWith('system:') ? 'system' : 'dashboard-user',
      actorIdentifier,
      eventType: 'cloudflare.uptime-provisioned',
      metadata: {
        healthCheckId: healthCheck.id,
        intervalSeconds: connection.normalIntervalSeconds,
        alertFailureThreshold: connection.alertFailureThreshold,
        providerPerformsProbes: true
      }
    })
    return connection
  }

  async reconcileUptime(siteId: string, at = new Date()): Promise<Record<string, unknown>> {
    const entitlement = await this.entitlements.get(siteId, at)
    if (!entitlement.capabilities['uptime-monitoring']) {
      await this.disableUptime(siteId)
      return { skipped: true, reason: 'uptime-monitoring-not-entitled' }
    }
    let connection = await new CloudflareRepository(this.database).findConnection(siteId)
    if (!connection?.healthCheckId || !connection.zoneId) connection = await this.provisionUptime(siteId)
    if (!connection.healthCheckId || !connection.zoneId) throw new Error('Cloudflare uptime provisioning did not return a health check.')
    const zoneId = connection.zoneId
    const healthCheckId = connection.healthCheckId
    const desiredNormalInterval = Math.max(60, (entitlement.settings.uptimeIntervalMinutes ?? 5) * 60)
    const desiredThreshold = entitlement.settings.uptimeAlertFailureThreshold ?? 2
    if (connection.normalIntervalSeconds !== desiredNormalInterval || connection.alertFailureThreshold !== desiredThreshold) {
      connection = await new CloudflareRepository(this.database).saveConnection({
        ...connection,
        normalIntervalSeconds: desiredNormalInterval,
        alertFailureThreshold: desiredThreshold,
        updatedAt: at.toISOString()
      })
    }
    const healthCheck = await this.client.getHealthCheck(zoneId, healthCheckId)
    const observedAt = at.toISOString()
    const status = healthCheck.status === 'healthy' ? 'healthy'
      : healthCheck.status === 'unhealthy' ? 'unhealthy' : 'unknown'
    const eventId = `reconcile:${healthCheck.id}:${observedAt.slice(0, 16)}:${status}`
    const result = await this.processObservation(siteId, {
      status,
      observedAt,
      reason: healthCheck.failure_reason ?? null,
      providerEventId: eventId,
      source: 'cloudflare-reconciliation',
      metadata: { healthCheckStatus: healthCheck.status }
    })
    await new CloudflareRepository(this.database).saveConnection({
      ...connection,
      healthCheckStatus: healthCheck.status,
      updatedAt: observedAt,
      lastSyncedAt: observedAt
    })
    return { providerStatus: healthCheck.status, ...result }
  }

  async processWebhook(payload: CloudflareWebhookPayload): Promise<{ duplicate: boolean, siteId: string, result: Record<string, unknown> }> {
    if (String(payload.alert_type ?? '') !== 'health_check_status_notification') {
      throw new Error('Unsupported Cloudflare notification type.')
    }
    const data = record(payload.data)
    const healthCheckId = requiredProviderText(data.health_check_id, 'Cloudflare health check ID')
    const connection = await new CloudflareRepository(this.database).findConnectionByHealthCheckId(healthCheckId)
    if (!connection) throw new Error('The Cloudflare health check is not mapped to a SiteCare site.')
    const rawStatus = String(data.new_health_status ?? data.new_status ?? '').toLowerCase()
    const status = rawStatus.includes('unhealthy') ? 'unhealthy'
      : rawStatus.includes('healthy') ? 'healthy' : 'unknown'
    const observedAt = providerDate(data.status_change_time)
    const eventId = createHash('sha256').update([
      String(payload.alert_correlation_id ?? payload.alert_id ?? ''),
      String(payload.alert_event ?? ''), healthCheckId, rawStatus, observedAt
    ].join(':')).digest('hex')
    const result = await this.processObservation(connection.siteId, {
      status,
      observedAt,
      reason: optionalProviderText(data.reason),
      providerEventId: `cloudflare:${eventId}`,
      source: 'cloudflare-webhook',
      metadata: { alertEvent: String(payload.alert_event ?? ''), rawStatus }
    })
    return { duplicate: result.duplicate === true, siteId: connection.siteId, result }
  }

  async processObservation(siteId: string, input: UptimeObservationInput): Promise<Record<string, unknown>> {
    const observedAt = providerDate(input.observedAt)
    const connection = await new CloudflareRepository(this.database).findConnection(siteId)
    if (!connection) throw new Error('The site does not have a Cloudflare connection record.')
    if (await new CloudflareRepository(this.database).hasObservationProviderEvent(input.providerEventId)) {
      return { duplicate: true }
    }
    const transient = await new CloudflareRepository(this.database).findMonitor(siteId)
    if (transient?.status === 'first-failure' && transient.firstFailureProviderEventId === input.providerEventId) {
      return { duplicate: true }
    }
    if (input.status === 'unknown') {
      await this.storeObservation(siteId, null, input, 'unknown', true)
      return { status: 'provider-unknown' }
    }
    const reason = input.reason?.trim().slice(0, 1000) || null
    if (input.status === 'unhealthy' && isTlsFailure(reason)) {
      return this.processTlsFailure(siteId, connection, { ...input, observedAt, reason })
    }
    const maintenance = await new CloudflareRepository(this.database).findActiveMaintenance(siteId, observedAt)
    if (input.status === 'unhealthy' && maintenance) {
      await this.storeObservation(siteId, null, input, 'maintenance', true, { maintenanceWindowId: maintenance.id })
      const monitor = await this.ensureMonitor(siteId, connection, observedAt)
      await new CloudflareRepository(this.database).saveMonitor({
        ...monitor,
        status: 'maintenance',
        lastReconciledAt: observedAt,
        updatedAt: observedAt
      })
      return { status: 'maintenance', excluded: true }
    }
    return input.status === 'healthy'
      ? this.processSuccess(siteId, connection, { ...input, observedAt, reason })
      : this.processFailure(siteId, connection, { ...input, observedAt, reason })
  }

  async synchronizeSecurity(siteId: string, actorIdentifier = 'system:cloudflare'): Promise<CloudflareSecurityControl[]> {
    const connection = await this.synchronizeSite(siteId, actorIdentifier)
    if (connection.availability !== 'available' || !connection.zoneId || !connection.zoneName) {
      throw new Error('A matching Cloudflare zone is required before security status can be synchronized.')
    }
    const zone = await this.client.findZone(connection.zoneName)
    if (!zone) throw new Error('The Cloudflare zone is no longer available.')
    const snapshot = await this.client.securitySnapshot(zone)
    const evidence = securityEvidence(snapshot, connection.homepageUrl)
    const checkedAt = new Date().toISOString()
    const syncId = randomUUID()
    await this.withTransaction(async executor => {
      const repository = new CloudflareRepository(executor)
      await repository.createSecuritySync({
        id: syncId,
        siteId,
        zoneId: zone.id,
        checkedAt,
        capabilities: snapshot.capabilities,
        warningCount: evidence.filter(item => item.status !== 'active').length
      })
      for (const item of evidence) {
        await repository.addSecurityEvidence({
          ...item,
          id: randomUUID(),
          siteId,
          syncId,
          observedAt: checkedAt,
          createdAt: checkedAt
        })
      }
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: actorIdentifier.startsWith('system:') ? 'system' : 'dashboard-user',
        actorIdentifier,
        eventType: 'cloudflare.security-synchronized',
        metadata: {
          zoneId: zone.id,
          activeCount: evidence.filter(item => item.status === 'active').length,
          reviewCount: evidence.filter(item => item.status !== 'active').length,
          capabilities: snapshot.capabilities
        }
      })
    })
    return (await this.getSiteDetail(siteId)).security.controls
  }

  async setTechnicianSecurityStatus(
    siteId: string,
    controlKey: string,
    status: 'active' | 'inactive' | 'pending',
    notes: string,
    actorIdentifier: string
  ): Promise<CloudflareSecurityControl[]> {
    const definition = cloudflareSecurityControlDefinitions.find(item => item.key === controlKey)
    if (!definition) throw new Error('Unsupported Cloudflare security control.')
    const normalizedNotes = notes.trim()
    if (!normalizedNotes) throw new Error('Technician evidence notes are required.')
    const now = new Date().toISOString()
    await this.withTransaction(async executor => {
      await new CloudflareRepository(executor).addSecurityEvidence({
        id: randomUUID(),
        siteId,
        syncId: null,
        controlKey: definition.key,
        status,
        source: 'technician',
        summary: `${definition.label} marked ${status} by a technician.`,
        notes: normalizedNotes.slice(0, 2000),
        evidence: {},
        observedAt: now,
        actorIdentifier,
        supersededAt: null,
        createdAt: now
      })
      await new AuditService(new AuditRepository(executor)).record({
        siteId,
        actorType: 'dashboard-user',
        actorIdentifier,
        eventType: 'cloudflare.security-technician-status-recorded',
        metadata: { controlKey, status }
      })
    })
    return (await this.getSiteDetail(siteId)).security.controls
  }

  async createMaintenanceWindow(
    siteId: string,
    input: { startsAt: string, endsAt: string, reason: string },
    actorIdentifier: string
  ) {
    await this.requireSite(siteId)
    const startsAt = providerDate(input.startsAt)
    const endsAt = providerDate(input.endsAt)
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('Maintenance must end after it starts.')
    const reason = input.reason.trim()
    if (!reason) throw new Error('A maintenance reason is required.')
    const now = new Date().toISOString()
    return this.withTransaction(async executor => {
      const window = await new CloudflareRepository(executor).saveMaintenance({
        id: randomUUID(), siteId, startsAt, endsAt, reason: reason.slice(0, 1000),
        createdBy: actorIdentifier, cancelledAt: null, cancelledBy: null,
        createdAt: now, updatedAt: now
      })
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'uptime.maintenance-window-created',
        metadata: { maintenanceWindowId: window.id, startsAt, endsAt }
      })
      return window
    })
  }

  async cancelMaintenanceWindow(siteId: string, windowId: string, actorIdentifier: string): Promise<void> {
    const now = new Date().toISOString()
    await this.withTransaction(async executor => {
      if (!await new CloudflareRepository(executor).cancelMaintenance(siteId, windowId, actorIdentifier, now)) {
        throw new Error('Active maintenance window not found.')
      }
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: 'uptime.maintenance-window-cancelled', metadata: { maintenanceWindowId: windowId }
      })
    })
  }

  async updateRecoveryReport(
    siteId: string,
    incidentId: string,
    input: { recoveryNotes?: string | null, restoredBackupReference?: string | null, sendReport?: boolean },
    actorIdentifier: string
  ): Promise<UptimeIncident> {
    return this.withTransaction(async executor => {
      const repository = new CloudflareRepository(executor)
      const incident = await repository.findIncident(siteId, incidentId)
      if (!incident) throw new Error('Uptime incident not found.')
      const now = new Date().toISOString()
      const updated = await repository.saveIncident({
        ...incident,
        recoveryNotes: optionalText(input.recoveryNotes, 4000),
        restoredBackupReference: optionalText(input.restoredBackupReference, 500),
        recoveryReportQueuedAt: input.sendReport ? now : incident.recoveryReportQueuedAt,
        updatedAt: now
      })
      if (input.sendReport) {
        const site = await this.requireSite(siteId, executor)
        await queueRecovery(new NotificationService(executor), site, updated, `manual:${now}`)
      }
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'dashboard-user', actorIdentifier,
        eventType: input.sendReport ? 'uptime.recovery-report-updated-and-queued' : 'uptime.recovery-report-updated',
        metadata: { incidentId, restoredBackupReference: updated.restoredBackupReference, sent: Boolean(input.sendReport) }
      })
      return updated
    })
  }

  async purgeRawHistory(at = new Date()): Promise<number> {
    const before = new Date(at.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
    return new CloudflareRepository(this.database).deleteObservationsBefore(before)
  }

  private async processFailure(
    siteId: string,
    connection: CloudflareSiteConnection,
    input: UptimeObservationInput & { observedAt: string, reason: string | null }
  ): Promise<Record<string, unknown>> {
    const monitor = await this.ensureMonitor(siteId, connection, input.observedAt)
    if (monitor.status === 'incident' && monitor.activeIncidentId) {
      return this.withTransaction(async executor => {
        const repository = new CloudflareRepository(executor)
        const incident = await repository.findIncident(siteId, monitor.activeIncidentId!)
        if (!incident) throw new Error('The active uptime incident could not be loaded.')
        const updated = await repository.saveIncident({
          ...incident,
          failureCount: incident.failureCount + 1,
          finalReason: input.reason,
          updatedAt: input.observedAt
        })
        const created = await this.storeObservation(siteId, incident.id, input, 'unhealthy', false, {}, executor)
        await repository.saveMonitor({
          ...monitor,
          consecutiveFailures: monitor.consecutiveFailures + (created ? 1 : 0),
          lastFailureAt: input.observedAt,
          lastFailureReason: input.reason,
          lastReconciledAt: input.observedAt,
          updatedAt: input.observedAt
        })
        return { status: 'incident', incidentId: updated.id, duplicate: !created }
      })
    }

    const nextCount = monitor.consecutiveFailures + 1
    if (nextCount < connection.alertFailureThreshold) {
      await new CloudflareRepository(this.database).saveMonitor({
        ...monitor,
        status: 'first-failure',
        consecutiveFailures: nextCount,
        firstFailureAt: monitor.firstFailureAt ?? input.observedAt,
        firstFailureProviderEventId: monitor.firstFailureProviderEventId ?? input.providerEventId,
        lastFailureAt: input.observedAt,
        lastFailureReason: input.reason,
        currentIntervalSeconds: await this.changeInterval(connection, 60, monitor.currentIntervalSeconds),
        lastReconciledAt: input.observedAt,
        updatedAt: input.observedAt
      })
      return { status: 'first-failure', consecutiveFailures: nextCount, alertSent: false }
    }

    return this.withTransaction(async executor => {
      const repository = new CloudflareRepository(executor)
      const incident: UptimeIncident = {
        id: randomUUID(), siteId, healthCheckId: connection.healthCheckId,
        status: 'open', startedAt: monitor.firstFailureAt ?? input.observedAt,
        confirmedAt: input.observedAt, recoveredAt: null, durationSeconds: null,
        failureCount: nextCount, initialReason: monitor.lastFailureReason ?? input.reason,
        finalReason: input.reason, recoveryNotes: null, restoredBackupReference: null,
        alertQueuedAt: input.observedAt, recoveryReportQueuedAt: null,
        createdAt: input.observedAt, updatedAt: input.observedAt
      }
      await repository.saveIncident(incident)
      if (monitor.firstFailureAt) {
        await repository.createObservation(observation(siteId, incident.id, {
          ...input,
          observedAt: monitor.firstFailureAt,
          reason: monitor.lastFailureReason,
          providerEventId: monitor.firstFailureProviderEventId ?? `first-failure:${siteId}:${monitor.firstFailureAt}`
        }, 'unhealthy', false))
      }
      await this.storeObservation(siteId, incident.id, input, 'unhealthy', false, {}, executor)
      await repository.saveMonitor({
        ...monitor,
        status: 'incident', consecutiveFailures: nextCount,
        firstFailureAt: incident.startedAt, lastFailureAt: input.observedAt,
        firstFailureProviderEventId: monitor.firstFailureProviderEventId,
        lastFailureReason: input.reason, currentIntervalSeconds: 60,
        activeIncidentId: incident.id, lastReconciledAt: input.observedAt,
        updatedAt: input.observedAt
      })
      const site = await this.requireSite(siteId, executor)
      await queueDowntime(new NotificationService(executor), site, incident)
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'system', actorIdentifier: 'cloudflare-monitoring',
        eventType: 'uptime.incident-confirmed',
        metadata: { incidentId: incident.id, startedAt: incident.startedAt, confirmedAt: incident.confirmedAt, failureCount: nextCount }
      })
      return { status: 'incident', incidentId: incident.id, alertSent: true }
    })
  }

  private async processSuccess(
    siteId: string,
    connection: CloudflareSiteConnection,
    input: UptimeObservationInput & { observedAt: string, reason: string | null }
  ): Promise<Record<string, unknown>> {
    const monitor = await this.ensureMonitor(siteId, connection, input.observedAt)
    const openTls = await new CloudflareRepository(this.database).findOpenTlsAlert(siteId)
    if (openTls) await this.resolveTls(siteId, openTls, input.observedAt)
    const restoredInterval = await this.changeInterval(connection, connection.normalIntervalSeconds, monitor.currentIntervalSeconds)
    if (monitor.status === 'first-failure' || monitor.status === 'maintenance') {
      await new CloudflareRepository(this.database).saveMonitor({
        ...monitor, status: 'healthy', consecutiveFailures: 0, firstFailureAt: null, firstFailureProviderEventId: null,
        lastFailureAt: null, lastFailureReason: null, lastSuccessAt: input.observedAt,
        currentIntervalSeconds: restoredInterval, activeIncidentId: null,
        lastReconciledAt: input.observedAt, updatedAt: input.observedAt
      })
      return { status: 'healthy', transientFailureDiscarded: monitor.status === 'first-failure' }
    }
    if (monitor.status !== 'incident' || !monitor.activeIncidentId) {
      const created = await this.storeObservation(siteId, null, input, 'healthy', false)
      await new CloudflareRepository(this.database).saveMonitor({
        ...monitor, status: 'healthy', consecutiveFailures: 0, firstFailureAt: null, firstFailureProviderEventId: null,
        lastFailureAt: null, lastFailureReason: null, lastSuccessAt: input.observedAt,
        currentIntervalSeconds: restoredInterval, activeIncidentId: null,
        lastReconciledAt: input.observedAt, updatedAt: input.observedAt
      })
      return { status: 'healthy', duplicate: !created }
    }

    return this.withTransaction(async executor => {
      const repository = new CloudflareRepository(executor)
      const incident = await repository.findIncident(siteId, monitor.activeIncidentId!)
      if (!incident) throw new Error('The active uptime incident could not be loaded.')
      const durationSeconds = Math.max(0, Math.round((Date.parse(input.observedAt) - Date.parse(incident.startedAt)) / 1000))
      const recovered: UptimeIncident = {
        ...incident, status: 'recovered', recoveredAt: input.observedAt,
        durationSeconds, finalReason: input.reason ?? incident.finalReason,
        recoveryReportQueuedAt: input.observedAt, updatedAt: input.observedAt
      }
      await repository.saveIncident(recovered)
      await this.storeObservation(siteId, incident.id, input, 'healthy', false, {}, executor)
      await repository.saveMonitor({
        ...monitor, status: 'healthy', consecutiveFailures: 0, firstFailureAt: null, firstFailureProviderEventId: null,
        lastFailureAt: null, lastFailureReason: null, lastSuccessAt: input.observedAt,
        currentIntervalSeconds: restoredInterval, activeIncidentId: null,
        lastReconciledAt: input.observedAt, updatedAt: input.observedAt
      })
      const site = await this.requireSite(siteId, executor)
      await queueRecovery(new NotificationService(executor), site, recovered, 'automatic')
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'system', actorIdentifier: 'cloudflare-monitoring',
        eventType: 'uptime.incident-recovered',
        metadata: { incidentId: incident.id, recoveredAt: input.observedAt, durationSeconds }
      })
      return { status: 'recovered', incidentId: incident.id, durationSeconds, recoveryReportSent: true }
    })
  }

  private async processTlsFailure(
    siteId: string,
    connection: CloudflareSiteConnection,
    input: UptimeObservationInput & { observedAt: string, reason: string | null }
  ): Promise<Record<string, unknown>> {
    const repository = new CloudflareRepository(this.database)
    const existing = await repository.findOpenTlsAlert(siteId)
    if (existing) {
      const created = await this.storeObservation(siteId, null, input, 'tls-error', true)
      return { status: 'tls-error', duplicate: !created, alertSent: false }
    }
    return this.withTransaction(async executor => {
      const alertId = randomUUID()
      const reason = input.reason ?? 'Cloudflare reported a TLS or certificate failure.'
      await new CloudflareRepository(executor).createTlsAlert({
        id: alertId, siteId, openedAt: input.observedAt, reason,
        alertQueuedAt: input.observedAt, createdAt: input.observedAt
      })
      await this.storeObservation(siteId, null, input, 'tls-error', true, {}, executor)
      const site = await this.requireSite(siteId, executor)
      await new NotificationService(executor).enqueueForSite(siteId, 'uptime', `tls:${alertId}:open`, {
        subject: `[SiteCare] TLS certificate alert: ${site.name}`,
        textContent: `Cloudflare reported a TLS or certificate problem for ${site.name} (${site.url}) at ${input.observedAt}.\n\n${reason}\n\nThis alert is tracked separately and is not counted as website downtime.`,
        htmlContent: `<p>Cloudflare reported a TLS or certificate problem for <strong>${escapeHtml(site.name)}</strong> at ${escapeHtml(input.observedAt)}.</p><p>${escapeHtml(reason)}</p><p>This alert is tracked separately and is not counted as website downtime.</p>`
      }, { messageType: 'uptime.tls-alert', templateKey: 'uptime-tls-alert', metadata: { alertId, url: site.url } })
      await new AuditService(new AuditRepository(executor)).record({
        siteId, actorType: 'system', actorIdentifier: 'cloudflare-monitoring',
        eventType: 'uptime.tls-alert-opened', metadata: { alertId }
      })
      return { status: 'tls-error', alertId, alertSent: true, countedAsDowntime: false }
    })
  }

  private async resolveTls(siteId: string, row: Record<string, unknown>, at: string): Promise<void> {
    await this.withTransaction(async executor => {
      const id = String(row.id)
      await new CloudflareRepository(executor).resolveTlsAlert(id, at)
      const site = await this.requireSite(siteId, executor)
      await new NotificationService(executor).enqueueForSite(siteId, 'uptime', `tls:${id}:resolved`, {
        subject: `[SiteCare] TLS certificate recovered: ${site.name}`,
        textContent: `Cloudflare reports that the TLS or certificate problem for ${site.name} (${site.url}) resolved at ${at}.`,
        htmlContent: `<p>Cloudflare reports that the TLS or certificate problem for <strong>${escapeHtml(site.name)}</strong> resolved at ${escapeHtml(at)}.</p>`
      }, { messageType: 'uptime.tls-recovered', templateKey: 'uptime-tls-recovered', metadata: { alertId: id, url: site.url } })
    })
  }

  private async disableUptime(siteId: string): Promise<void> {
    const repository = new CloudflareRepository(this.database)
    const connection = await repository.findConnection(siteId)
    if (connection?.zoneId && connection.healthCheckId) {
      try {
        await this.client.updateHealthCheck(connection.zoneId, connection.healthCheckId, { suspended: true })
      } catch {
        // Persist the entitlement state even when the provider is temporarily unavailable.
      }
    }
    const now = new Date().toISOString()
    const monitor = await repository.findMonitor(siteId)
    await repository.saveMonitor({
      ...newMonitor(siteId, connection?.normalIntervalSeconds ?? 300, now),
      ...monitor,
      status: 'disabled', consecutiveFailures: 0, firstFailureAt: null, firstFailureProviderEventId: null,
      activeIncidentId: null, updatedAt: now
    })
  }

  private async changeInterval(connection: CloudflareSiteConnection, desired: number, current: number): Promise<number> {
    if (desired === current || !connection.zoneId || !connection.healthCheckId) return current
    try {
      const updated = await this.client.updateHealthCheck(connection.zoneId, connection.healthCheckId, { interval: desired })
      return updated.interval
    } catch {
      return current
    }
  }

  private async ensureMonitor(siteId: string, connection: CloudflareSiteConnection, now: string): Promise<UptimeMonitorState> {
    return await new CloudflareRepository(this.database).findMonitor(siteId)
      ?? newMonitor(siteId, connection.normalIntervalSeconds, now)
  }

  private async storeObservation(
    siteId: string,
    incidentId: string | null,
    input: UptimeObservationInput,
    status: UptimeObservation['status'],
    excluded: boolean,
    metadata: Record<string, unknown> = {},
    executor: QueryExecutor = this.database
  ): Promise<boolean> {
    return new CloudflareRepository(executor).createObservation(observation(
      siteId, incidentId, input, status, excluded, metadata
    ))
  }

  private async requireSite(siteId: string, executor: QueryExecutor = this.database) {
    const site = await new SiteRepository(executor).findById(siteId)
    if (!site) throw new Error('Site not found.')
    return site
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}

export function verifyCloudflareWebhookSecret(received: string | undefined, expected: string): boolean {
  if (!received || !expected) return false
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function observation(
  siteId: string,
  incidentId: string | null,
  input: UptimeObservationInput,
  status: UptimeObservation['status'],
  excluded: boolean,
  metadata: Record<string, unknown> = {}
): UptimeObservation {
  return {
    id: randomUUID(), siteId, incidentId, providerEventId: input.providerEventId,
    source: input.source, status, reason: input.reason ?? null,
    excludedFromDowntime: excluded, observedAt: input.observedAt,
    metadata: { ...(input.metadata ?? {}), ...metadata }, createdAt: new Date().toISOString()
  }
}

function newMonitor(siteId: string, interval: number, now: string): UptimeMonitorState {
  return {
    siteId, status: 'not-configured', consecutiveFailures: 0,
    firstFailureAt: null, firstFailureProviderEventId: null, lastFailureAt: null, lastFailureReason: null,
    lastSuccessAt: null, currentIntervalSeconds: interval,
    activeIncidentId: null, lastReconciledAt: null, createdAt: now, updatedAt: now
  }
}

function securityEvidence(snapshot: CloudflareSecurityApiSnapshot, homepageUrl: string): Array<Omit<CloudflareSecurityEvidence, 'id' | 'siteId' | 'syncId' | 'observedAt' | 'createdAt'>> {
  const settings = new Map(snapshot.settings.map(setting => [setting.id, setting.value]))
  const domain = new URL(homepageUrl).hostname.toLowerCase()
  const dns = snapshot.dnsRecords.filter(record => String(record.name ?? '').toLowerCase() === domain)
  const setting = (key: string, expected: unknown, label: string) => {
    if (snapshot.capabilities['zone-settings'] === 'unavailable' || !settings.has(key)) {
      return evidence(keyToControl(key), 'unavailable', `${label} could not be read through the available Cloudflare API permissions.`, { setting: key })
    }
    const value = settings.get(key)
    return evidence(keyToControl(key), value === expected ? 'active' : 'inactive', `${label} is ${String(value)}.`, { setting: key, value })
  }
  const output = [
    snapshot.capabilities['dns-records'] === 'unavailable'
      ? evidence('proxy-cdn', 'unavailable', 'Proxy status could not be read through the available Cloudflare API permissions.')
      : evidence('proxy-cdn', dns.some(item => item.proxied === true) ? 'active' : 'inactive',
          dns.some(item => item.proxied === true) ? 'The homepage hostname is proxied through Cloudflare.' : 'The homepage hostname is not proxied through Cloudflare.',
          { matchingRecordCount: dns.length, proxiedRecordCount: dns.filter(item => item.proxied).length }),
    setting('automatic_https_rewrites', 'on', 'Automatic HTTPS Rewrites'),
    setting('always_use_https', 'on', 'Always Use HTTPS'),
    setting('opportunistic_encryption', 'on', 'Opportunistic Encryption'),
    setting('brotli', 'on', 'Cloudflare-managed compression'),
    setting('http3', 'on', 'HTTP/3'),
    settings.has('automatic_platform_optimization')
      ? evidence('apo', apoEnabled(settings.get('automatic_platform_optimization')) ? 'active' : 'inactive', `Automatic Platform Optimization is ${apoEnabled(settings.get('automatic_platform_optimization')) ? 'enabled' : 'not enabled'}.`)
      : evidence('apo', 'unavailable', 'Automatic Platform Optimization is not exposed for this zone and may not apply.'),
    setting('browser_check', 'on', 'Browser Integrity Check'),
    snapshot.capabilities['bot-management'] === 'unavailable' || !snapshot.botManagement
      ? evidence('bot-fight-mode', 'unavailable', 'Bot Fight Mode could not be read for this zone or plan.')
      : evidence('bot-fight-mode', snapshot.botManagement.fight_mode === true ? 'active' : 'inactive', `Bot Fight Mode is ${snapshot.botManagement.fight_mode === true ? 'enabled' : 'disabled'}.`),
    snapshot.capabilities['managed-rules'] === 'unavailable'
      ? evidence('waf-managed-rules', 'unavailable', 'Cloudflare Managed Rules could not be read for this zone or plan.')
      : evidence('waf-managed-rules', hasEnabledRules(snapshot.managedRuleset) ? 'active' : 'inactive', hasEnabledRules(snapshot.managedRuleset) ? 'Cloudflare Managed Rules are deployed.' : 'No enabled Cloudflare Managed Rules deployment was found.'),
    evidence('ddos-protection', snapshot.zone.status === 'active' ? 'active' : 'review', 'Cloudflare DDoS protection is an informational platform capability for active proxied zones.', { zoneStatus: snapshot.zone.status }, 'informational'),
    snapshot.capabilities.dnssec === 'unavailable' || !snapshot.dnssec
      ? evidence('dnssec', 'unavailable', 'DNSSEC could not be read for this zone or registrar configuration.')
      : evidence('dnssec', dnssecStatus(snapshot.dnssec), `DNSSEC status is ${String(snapshot.dnssec.status ?? 'unknown')}.`),
    snapshot.capabilities['universal-ssl'] === 'unavailable' || !snapshot.universalSsl
      ? evidence('universal-ssl', 'unavailable', 'Universal SSL could not be read for this zone or plan.')
      : evidence('universal-ssl', snapshot.universalSsl.enabled === true ? 'active' : 'inactive', `Universal SSL is ${snapshot.universalSsl.enabled === true ? 'enabled' : 'disabled'}.`),
    standardCachingEvidence(settings, snapshot),
    securityLevelEvidence(settings, snapshot)
  ]
  return output
}

function evidence(
  controlKey: CloudflareSecurityControlKey,
  status: CloudflareSecurityStatus,
  summary: string,
  details: Record<string, unknown> = {},
  source: CloudflareSecurityEvidence['source'] = 'cloudflare-api'
): Omit<CloudflareSecurityEvidence, 'id' | 'siteId' | 'syncId' | 'observedAt' | 'createdAt'> {
  return { controlKey, status, source, summary, notes: null, evidence: details, actorIdentifier: null, supersededAt: null }
}

function keyToControl(key: string): CloudflareSecurityControlKey {
  const map: Record<string, CloudflareSecurityControlKey> = {
    automatic_https_rewrites: 'automatic-https-rewrites',
    always_use_https: 'always-use-https',
    opportunistic_encryption: 'opportunistic-encryption',
    brotli: 'brotli', http3: 'http3', browser_check: 'browser-integrity-check'
  }
  return map[key]!
}

function standardCachingEvidence(settings: Map<string | undefined, unknown>, snapshot: CloudflareSecurityApiSnapshot) {
  if (snapshot.capabilities['zone-settings'] === 'unavailable' || !settings.has('cache_level')) {
    return evidence('standard-caching', 'unavailable', 'Caching status could not be read through the available Cloudflare API permissions.')
  }
  const cacheLevel = settings.get('cache_level')
  const rules = Array.isArray(snapshot.cacheRuleset?.rules) ? snapshot.cacheRuleset.rules as Array<Record<string, unknown>> : []
  const siteWideBypass = rules.some(rule => rule.enabled !== false && rule.action === 'set_cache_settings'
    && record(rule.action_parameters).cache === false && ['true', '(true)'].includes(String(rule.expression ?? '').trim().toLowerCase()))
  const active = cacheLevel !== 'bypass' && !siteWideBypass
  return evidence('standard-caching', active ? 'active' : 'inactive', active
    ? `Cloudflare caching is enabled (${String(cacheLevel)}) without a detected site-wide bypass.`
    : 'A site-wide cache bypass or disabled cache level was detected.', { cacheLevel, siteWideBypass })
}

function securityLevelEvidence(settings: Map<string | undefined, unknown>, snapshot: CloudflareSecurityApiSnapshot) {
  if (snapshot.capabilities['zone-settings'] === 'unavailable' || !settings.has('security_level')) {
    return evidence('security-level', 'unavailable', 'Security Level could not be read through the available Cloudflare API permissions.')
  }
  const level = String(settings.get('security_level') ?? '')
  const status: CloudflareSecurityStatus = level === 'medium' ? 'active'
    : ['high', 'under_attack'].includes(level) ? 'review' : 'inactive'
  return evidence('security-level', status, level === 'medium'
    ? 'Security Level is Medium.'
    : ['high', 'under_attack'].includes(level)
      ? `Security Level is ${level}; review before lowering stronger protection.`
      : `Security Level is ${level || 'unknown'}, not Medium.`, { level })
}

function effectiveControls(all: CloudflareSecurityEvidence[]): CloudflareSecurityControl[] {
  return cloudflareSecurityControlDefinitions.map(definition => {
    const apiEvidence = all
      .filter(item => item.controlKey === definition.key && item.source !== 'technician')
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null
    const technicianOverride = all
      .filter(item => item.controlKey === definition.key && item.source === 'technician')
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null
    const effective = technicianOverride ?? apiEvidence ?? {
      id: `missing:${definition.key}`, siteId: '', syncId: null, controlKey: definition.key,
      status: 'unavailable' as const, source: 'cloudflare-api' as const,
      summary: 'This setting has not been checked yet.', notes: null, evidence: {},
      observedAt: '', actorIdentifier: null, supersededAt: null, createdAt: ''
    }
    return { ...effective, label: definition.label, apiEvidence, technicianOverride }
  })
}

function hasEnabledRules(ruleset: Record<string, unknown> | null): boolean {
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules as Array<Record<string, unknown>> : []
  return rules.some(rule => rule.enabled !== false && rule.action === 'execute')
}

function dnssecStatus(value: Record<string, unknown>): CloudflareSecurityStatus {
  const status = String(value.status ?? '').toLowerCase()
  return status === 'active' ? 'active' : status.includes('pending') ? 'pending' : 'inactive'
}

function apoEnabled(value: unknown): boolean {
  return value === 'on' || value === true || (value !== null && typeof value === 'object' && (value as Record<string, unknown>).enabled === true)
}

async function queueDowntime(notification: NotificationService, site: { id: string, name: string, url: string }, incident: UptimeIncident) {
  return notification.enqueueForSite(site.id, 'uptime', `incident:${incident.id}:confirmed`, {
    subject: `[SiteCare] Downtime confirmed: ${site.name}`,
    textContent: `SiteCare confirmed that ${site.name} (${site.url}) is unavailable.\n\nFirst failure: ${incident.startedAt}\nConfirmed: ${incident.confirmedAt}\nConsecutive failures: ${incident.failureCount}\nReason: ${incident.finalReason ?? 'Cloudflare did not provide a reason.'}\n\nCloudflare is checking this site every 60 seconds until it recovers.`,
    htmlContent: `<p>SiteCare confirmed that <strong>${escapeHtml(site.name)}</strong> is unavailable.</p><dl><dt>First failure</dt><dd>${escapeHtml(incident.startedAt)}</dd><dt>Confirmed</dt><dd>${escapeHtml(incident.confirmedAt)}</dd><dt>Consecutive failures</dt><dd>${incident.failureCount}</dd><dt>Reason</dt><dd>${escapeHtml(incident.finalReason ?? 'Cloudflare did not provide a reason.')}</dd></dl><p>Cloudflare is checking this site every 60 seconds until it recovers.</p>`
  }, { messageType: 'uptime.incident', templateKey: 'uptime-incident', metadata: { incidentId: incident.id, url: site.url } })
}

async function queueRecovery(notification: NotificationService, site: { id: string, name: string, url: string }, incident: UptimeIncident, suffix: string) {
  const duration = formatDuration(incident.durationSeconds ?? 0)
  return notification.enqueueForSite(site.id, 'uptime', `incident:${incident.id}:recovery:${suffix}`, {
    subject: `[SiteCare] Recovery report: ${site.name}`,
    textContent: `SiteCare confirmed that ${site.name} (${site.url}) recovered successfully.\n\nDowntime began: ${incident.startedAt}\nRecovery: ${incident.recoveredAt ?? 'Unknown'}\nTotal downtime: ${duration}\nTechnician notes: ${incident.recoveryNotes ?? 'No technician notes were recorded.'}\nBackup restored: ${incident.restoredBackupReference ?? 'No backup restoration was recorded.'}`,
    htmlContent: `<p>SiteCare confirmed that <strong>${escapeHtml(site.name)}</strong> recovered successfully.</p><dl><dt>Downtime began</dt><dd>${escapeHtml(incident.startedAt)}</dd><dt>Recovery</dt><dd>${escapeHtml(incident.recoveredAt ?? 'Unknown')}</dd><dt>Total downtime</dt><dd>${escapeHtml(duration)}</dd><dt>Technician notes</dt><dd>${escapeHtml(incident.recoveryNotes ?? 'No technician notes were recorded.')}</dd><dt>Backup restored</dt><dd>${escapeHtml(incident.restoredBackupReference ?? 'No backup restoration was recorded.')}</dd></dl>`
  }, { messageType: 'uptime.recovery', templateKey: 'uptime-recovery', metadata: { incidentId: incident.id, url: site.url } })
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function providerDate(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) throw new Error('Cloudflare notification has an invalid status change time.')
  return date.toISOString()
}
function requiredProviderText(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}
function optionalProviderText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, 1000) : null
}
function isTlsFailure(reason: string | null): boolean {
  return Boolean(reason && /\b(tls|ssl|certificate|x509|handshake)\b/i.test(reason))
}
function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Cloudflare request failed.')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1000)
}
function optionalText(value: string | null | undefined, max: number): string | null {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, max) : null
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes} minute${minutes === 1 ? '' : 's'} ${remainder} second${remainder === 1 ? '' : 's'}` : `${remainder} second${remainder === 1 ? '' : 's'}`
}
