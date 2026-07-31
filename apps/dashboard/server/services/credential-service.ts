import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { SiteCredential, SitePluginConnection } from '../domain/types'
import { SiteRepository } from '../repositories/site-repository'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'

export interface IssuedCredential {
  credential: SafeSiteCredential
  secret: string
}

export type SafeSiteCredential = Omit<SiteCredential, 'secretCiphertext'>

export interface AcceptedSiteCredential {
  credential: SafeSiteCredential
  secret: string
}

export interface CredentialRotationOffer {
  credentialId: string
  secret: string
  issuedAt: string
  confirmationRequired: true
}

export interface CredentialLifecycleSettings {
  rotationDays: number
  overlapDays: number
}

const defaultLifecycleSettings: CredentialLifecycleSettings = {
  rotationDays: 180,
  overlapDays: 14
}

export class CredentialService {
  constructor(
    private readonly encryptionKey: string,
    private readonly siteRepository = new SiteRepository(),
    private readonly auditService = new AuditService(),
    private readonly lifecycleSettings = defaultLifecycleSettings
  ) {}

  async issue(siteId: string, actorIdentifier?: string): Promise<IssuedCredential> {
    const site = await this.siteRepository.findById(siteId)
    if (!site) throw new Error('Site not found.')

    const now = new Date().toISOString()
    const existingCredential = await this.siteRepository.findActiveCredential(siteId)
    const generated = this.generateCredential(siteId, 'active', now, null, null)
    const connection = await this.connectionRecord({
      siteId,
      now,
      status: 'awaiting-check-in',
      rotationDueAt: this.addDays(now, this.lifecycleSettings.rotationDays)
    })
    const credential = await this.siteRepository.replaceCredentialAndConnection(generated.credential, connection, now)
    const issued = { credential: this.safe(credential), secret: generated.secret }

    await this.auditService.record({
      siteId,
      actorType: actorIdentifier ? 'dashboard-user' : 'system',
      actorIdentifier,
      eventType: existingCredential ? 'credential.rotated' : 'credential.issued',
      metadata: {
        credentialId: issued.credential.id,
        secretHint: issued.credential.secretHint,
        lifecycleMode: existingCredential ? 'manual-reconnect' : 'initial-connection'
      }
    })
    return issued
  }

  async beginAutomaticRotation(siteId: string, force = false): Promise<CredentialRotationOffer | null> {
    const existingPending = await this.siteRepository.findPendingCredential(siteId)
    if (existingPending) return this.rotationOffer(existingPending)

    const active = await this.siteRepository.findActiveCredential(siteId)
    if (!active) return null
    const connection = await this.siteRepository.getPluginConnection(siteId)
    const dueAt = connection?.rotationDueAt ?? this.addDays(active.createdAt, this.lifecycleSettings.rotationDays)
    if (!force && Date.parse(dueAt) > Date.now()) return null

    const now = new Date().toISOString()
    const generated = this.generateCredential(siteId, 'pending', now, active.id, null)
    const pendingConnection = await this.connectionRecord({
      siteId,
      now,
      status: connection?.status ?? 'connected',
      lastRotationStartedAt: now,
      rotationDueAt: dueAt
    })
    const credential = await this.siteRepository.createPendingCredentialAndConnection(generated.credential, pendingConnection)
    const issued = { credential: this.safe(credential), secret: generated.secret }
    await this.auditService.record({
      siteId,
      actorType: 'system',
      eventType: 'credential.rotation-started',
      metadata: {
        credentialId: issued.credential.id,
        supersedesCredentialId: active.id,
        secretHint: issued.credential.secretHint
      }
    })
    return {
      credentialId: issued.credential.id,
      secret: issued.secret,
      issuedAt: issued.credential.createdAt,
      confirmationRequired: true
    }
  }

  async getAcceptedCredentials(siteId: string, at = new Date().toISOString()): Promise<AcceptedSiteCredential[]> {
    await this.siteRepository.revokeExpiredOverlapCredentials(at)
    return (await this.siteRepository.listAcceptedCredentials(siteId, at)).map(credential => ({
      credential: this.safe(credential),
      secret: decryptSecret(credential.secretCiphertext, this.encryptionKey)
    }))
  }

  async recordAuthenticated(siteId: string, credentialId: string, usedAt: string): Promise<void> {
    const accepted = await this.siteRepository.listAcceptedCredentials(siteId, usedAt)
    const credential = accepted.find(entry => entry.id === credentialId)
    if (!credential) throw new Error('Accepted site credential not found.')

    await this.siteRepository.recordCredentialUse(credentialId, usedAt)
    if (credential.state === 'pending') {
      const overlapUntil = this.addDays(usedAt, this.lifecycleSettings.overlapDays)
      const nextRotationDueAt = this.addDays(usedAt, this.lifecycleSettings.rotationDays)
      const confirmed = await this.siteRepository.confirmPendingCredential(
        siteId,
        credentialId,
        usedAt,
        overlapUntil,
        nextRotationDueAt
      )
      if (confirmed) {
        await this.auditService.record({
          siteId,
          actorType: 'wordpress-plugin',
          actorIdentifier: credentialId,
          eventType: 'credential.rotation-completed',
          metadata: { credentialId, previousCredentialValidUntil: overlapUntil }
        })
      }
    }

    const connection = await this.siteRepository.getPluginConnection(siteId)
    await this.upsertConnection({
      siteId,
      now: usedAt,
      status: 'connected',
      lastAuthenticatedAt: usedAt,
      rotationDueAt: connection?.rotationDueAt
        ?? this.addDays(credential.createdAt, this.lifecycleSettings.rotationDays)
    })
  }

  async claimSignedRequest(siteId: string, signature: string, acceptedAt: string): Promise<boolean> {
    const signatureHash = createHash('sha256').update(signature).digest('hex')
    return this.siteRepository.claimPluginRequest(
      siteId,
      signatureHash,
      acceptedAt,
      new Date(Date.parse(acceptedAt) + 5 * 60 * 1000).toISOString()
    )
  }

  async recordCheckIn(
    siteId: string,
    input: { contractVersion: number, pluginVersion: string | null, wordpressHomeUrl: string | null },
    checkedInAt = new Date().toISOString()
  ): Promise<{ connection: SitePluginConnection, rotation: CredentialRotationOffer | null }> {
    const existing = await this.siteRepository.getPluginConnection(siteId)
    const connection = await this.upsertConnection({
      siteId,
      now: checkedInAt,
      status: 'connected',
      contractVersion: input.contractVersion,
      pluginVersion: input.pluginVersion,
      wordpressHomeUrl: input.wordpressHomeUrl,
      lastAuthenticatedAt: existing?.lastAuthenticatedAt ?? checkedInAt,
      lastCheckInAt: checkedInAt,
      rotationDueAt: existing?.rotationDueAt
    })
    return {
      connection,
      rotation: input.contractVersion >= 2
        ? await this.beginAutomaticRotation(siteId)
        : null
    }
  }

  async getActiveSecret(siteId: string): Promise<string> {
    const credential = await this.siteRepository.findActiveCredential(siteId)
    if (!credential) throw new Error('Active site credential not found.')
    return decryptSecret(credential.secretCiphertext, this.encryptionKey)
  }

  async getActiveSummary(siteId: string): Promise<SafeSiteCredential | null> {
    const credential = await this.siteRepository.findActiveCredential(siteId)
    return credential ? this.safe(credential) : null
  }

  async getConnectionSummary(siteId: string): Promise<{
    connection: SitePluginConnection | null
    activeCredential: SafeSiteCredential | null
    pendingCredential: SafeSiteCredential | null
    credentials: SafeSiteCredential[]
  }> {
    const storedConnection = await this.siteRepository.getPluginConnection(siteId)
    const connection = storedConnection?.status === 'connected'
      && storedConnection.lastCheckInAt
      && Date.now() - Date.parse(storedConnection.lastCheckInAt) > 12 * 60 * 60 * 1000
      ? { ...storedConnection, status: 'stale' as const }
      : storedConnection
    const pendingCredential = await this.siteRepository.findPendingCredential(siteId)
    return {
      connection,
      activeCredential: await this.getActiveSummary(siteId),
      pendingCredential: pendingCredential ? this.safe(pendingCredential) : null,
      credentials: await this.list(siteId)
    }
  }

  async revokeAll(siteId: string, actorIdentifier?: string): Promise<void> {
    if (!await this.siteRepository.findById(siteId)) throw new Error('Site not found.')
    const now = new Date().toISOString()
    const existing = await this.siteRepository.getPluginConnection(siteId)
    const revokedConnection = await this.connectionRecord({
      siteId,
      now,
      status: 'revoked',
      rotationDueAt: existing?.rotationDueAt ?? null
    })
    await this.siteRepository.revokeCredentialsAndSaveConnection(siteId, revokedConnection, now)
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'credential.connection-revoked'
    })
  }

  async list(siteId: string): Promise<SafeSiteCredential[]> {
    return (await this.siteRepository.listCredentials(siteId)).map(credential => this.safe(credential))
  }

  private generateCredential(
    siteId: string,
    state: SiteCredential['state'],
    createdAt: string,
    supersedesCredentialId: string | null,
    validUntil: string | null
  ): { credential: SiteCredential, secret: string } {
    const secret = randomBytes(32).toString('base64url')
    const credential: SiteCredential = {
      id: randomUUID(),
      siteId,
      secretCiphertext: encryptSecret(secret, this.encryptionKey),
      secretHint: secret.slice(-6),
      state,
      validUntil,
      confirmedAt: state === 'active' ? createdAt : null,
      lastUsedAt: null,
      supersedesCredentialId,
      createdAt,
      revokedAt: null
    }
    return { credential, secret }
  }

  private rotationOffer(credential: SiteCredential): CredentialRotationOffer {
    return {
      credentialId: credential.id,
      secret: decryptSecret(credential.secretCiphertext, this.encryptionKey),
      issuedAt: credential.createdAt,
      confirmationRequired: true
    }
  }

  private safe(credential: SiteCredential): SafeSiteCredential {
    const { secretCiphertext: _secretCiphertext, ...safeCredential } = credential
    return safeCredential
  }

  private addDays(timestamp: string, days: number): string {
    return new Date(Date.parse(timestamp) + days * 86_400_000).toISOString()
  }

  private async upsertConnection(input: {
    siteId: string
    now: string
    status: SitePluginConnection['status']
    contractVersion?: number
    pluginVersion?: string | null
    wordpressHomeUrl?: string | null
    lastAuthenticatedAt?: string | null
    lastCheckInAt?: string | null
    lastRotationStartedAt?: string | null
    lastRotationCompletedAt?: string | null
    rotationDueAt?: string | null
  }): Promise<SitePluginConnection> {
    return this.siteRepository.upsertPluginConnection(await this.connectionRecord(input))
  }

  private async connectionRecord(input: {
    siteId: string
    now: string
    status: SitePluginConnection['status']
    contractVersion?: number
    pluginVersion?: string | null
    wordpressHomeUrl?: string | null
    lastAuthenticatedAt?: string | null
    lastCheckInAt?: string | null
    lastRotationStartedAt?: string | null
    lastRotationCompletedAt?: string | null
    rotationDueAt?: string | null
  }): Promise<SitePluginConnection> {
    const existing = await this.siteRepository.getPluginConnection(input.siteId)
    return {
      siteId: input.siteId,
      status: input.status,
      contractVersion: input.contractVersion ?? existing?.contractVersion ?? 1,
      pluginVersion: input.pluginVersion === undefined ? existing?.pluginVersion ?? null : input.pluginVersion,
      wordpressHomeUrl: input.wordpressHomeUrl === undefined ? existing?.wordpressHomeUrl ?? null : input.wordpressHomeUrl,
      lastAuthenticatedAt: input.lastAuthenticatedAt === undefined
        ? existing?.lastAuthenticatedAt ?? null
        : input.lastAuthenticatedAt,
      lastCheckInAt: input.lastCheckInAt === undefined ? existing?.lastCheckInAt ?? null : input.lastCheckInAt,
      lastRotationStartedAt: input.lastRotationStartedAt === undefined
        ? existing?.lastRotationStartedAt ?? null
        : input.lastRotationStartedAt,
      lastRotationCompletedAt: input.lastRotationCompletedAt === undefined
        ? existing?.lastRotationCompletedAt ?? null
        : input.lastRotationCompletedAt,
      rotationDueAt: input.rotationDueAt === undefined ? existing?.rotationDueAt ?? null : input.rotationDueAt,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    }
  }
}
