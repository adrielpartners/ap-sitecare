import { randomBytes, randomUUID } from 'node:crypto'
import type { SiteCredential } from '../domain/types'
import { SiteRepository } from '../repositories/site-repository'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'

export interface IssuedCredential {
  credential: Omit<SiteCredential, 'secretCiphertext'>
  secret: string
}

export type SafeSiteCredential = Omit<SiteCredential, 'secretCiphertext'>

export class CredentialService {
  constructor(
    private readonly encryptionKey: string,
    private readonly siteRepository = new SiteRepository(),
    private readonly auditService = new AuditService()
  ) {}

  issue(siteId: string): IssuedCredential {
    if (!this.siteRepository.findById(siteId)) throw new Error('Site not found.')

    const now = new Date().toISOString()
    const existingCredential = this.siteRepository.findActiveCredential(siteId)
    this.siteRepository.revokeActiveCredential(siteId, now)
    const secret = randomBytes(32).toString('base64url')
    const credential = this.siteRepository.createCredential({
      id: randomUUID(),
      siteId,
      secretCiphertext: encryptSecret(secret, this.encryptionKey),
      secretHint: secret.slice(-6),
      createdAt: now,
      revokedAt: null
    })

    this.auditService.record({
      siteId,
      actorType: 'system',
      eventType: existingCredential ? 'credential.rotated' : 'credential.issued',
      metadata: { credentialId: credential.id, secretHint: credential.secretHint }
    })

    const { secretCiphertext: _secretCiphertext, ...safeCredential } = credential
    return { credential: safeCredential, secret }
  }

  getActiveSecret(siteId: string): string {
    const credential = this.siteRepository.findActiveCredential(siteId)
    if (!credential) throw new Error('Active site credential not found.')
    return decryptSecret(credential.secretCiphertext, this.encryptionKey)
  }

  getActiveSummary(siteId: string): SafeSiteCredential | null {
    const credential = this.siteRepository.findActiveCredential(siteId)
    if (!credential) return null
    const { secretCiphertext: _secretCiphertext, ...safeCredential } = credential
    return safeCredential
  }

  list(siteId: string): SafeSiteCredential[] {
    return this.siteRepository.listCredentials(siteId).map((credential) => {
      const { secretCiphertext: _secretCiphertext, ...safeCredential } = credential
      return safeCredential
    })
  }
}
